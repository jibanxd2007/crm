const { resolveUser, createVercelHandler, safeDbUpsert, toDeterministicUuid } = require('./_utils/index.js');
const { assignLeadAtomically, findOrCreatePageScopedContact, parseLeadFieldData } = require('./_utils/lead-ingestion.js');
const { syncZernioLeads } = require('./_utils/zernio-client.js');
let createClient = null;
try {
  createClient = require('@supabase/supabase-js').createClient;
} catch (e) {}

function getSupabaseAdmin() {
  if (!createClient) return null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function leadsHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, x-user-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Mandatory Authentication Check
  const user = resolveUser(req.headers);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Authentication credentials required" });
  }

  const requestedPage = req.query?.page_id || req.query?.pageId;
  const supabase = getSupabaseAdmin();

  // 2. Authorization Check for Page Scoping
  if (requestedPage && user.role !== 'admin' && !user.pages.includes('*')) {
    if (!user.pages.includes(requestedPage)) {
      return res.status(403).json({
        error: "Forbidden: Access denied to unassigned page",
        requestedPage: requestedPage,
        userRole: user.role
      });
    }
  }

  // 3. POST /api/leads — Create or Assign Lead
  if (req.method === 'POST') {
    const body = req.body || {};
    const targetPage = body.page_id || body.pageId;

    if (targetPage && user.role !== 'admin' && !user.pages.includes('*') && !user.pages.includes(targetPage)) {
      return res.status(403).json({
        error: "Forbidden: Cannot create or modify leads for unassigned page"
      });
    }

    if ((req.url && req.url.includes('first-response')) || body.action === 'first-response' || (req.query && req.query.path === 'first-response')) {
      const leadId = body.leadId || body.id || 'lead_sample';
      const action = body.action || 'call';
      const isAutomated = body.isAutomated === true || body.is_automated === true;
      const nowIso = new Date().toISOString();

      global.CRM_LEADS_SPEED = global.CRM_LEADS_SPEED || new Map();
      let record = global.CRM_LEADS_SPEED.get(leadId);

      // Automated acknowledgements MUST NOT set or improve human first-response metrics!
      if (isAutomated) {
        if (!record) {
          record = {
            leadId,
            firstResponseAt: null,
            humanFirstResponseAt: null,
            autoAckSentAt: nowIso,
            firstResponseAction: null,
            respondedBy: 'automation',
            writeAttempts: 1,
            wasUpdated: false
          };
          global.CRM_LEADS_SPEED.set(leadId, record);
        } else if (!record.autoAckSentAt) {
          record.autoAckSentAt = nowIso;
        }
        if (supabase) {
          try { await supabase.from('leads').update({ auto_ack_sent_at: nowIso }).eq('id', leadId).is('auto_ack_sent_at', null); } catch (e) {}
        }
        return res.status(200).json({
          status: "success",
          isAutomated: true,
          record: { ...record }
        });
      }

      if (!record || !record.humanFirstResponseAt) {
        record = {
          ...(record || {}),
          leadId,
          firstResponseAt: nowIso,
          humanFirstResponseAt: nowIso,
          firstResponseAction: action,
          respondedBy: user.id || user.email,
          writeAttempts: (record ? record.writeAttempts : 0) + 1,
          wasUpdated: true
        };
        global.CRM_LEADS_SPEED.set(leadId, record);
        if (supabase) {
          try {
            await supabase
              .from('leads')
              .update({ first_response_at: nowIso, human_first_response_at: nowIso })
              .eq('id', leadId)
              .is('human_first_response_at', null);
          } catch (e) {}
        }
      } else {
        record.writeAttempts += 1;
        record.wasUpdated = false;
      }

      return res.status(200).json({
        status: "success",
        isAutomated: false,
        record: { ...record }
      });
    }

    if (body.action === 'assign' || (req.url && req.url.includes('/assign'))) {
      const leadId = body.leadId || body.id;
      const staffId = body.staffId !== undefined ? body.staffId : body.assignedTo;
      const pageId = targetPage || null;

      // Enforce page authorization for the caller
      if (supabase && leadId && user.role !== 'admin' && !user.pages.includes('*')) {
        const { data: existingLead } = await supabase.from('leads').select('id, page_id').eq('id', leadId).maybeSingle();
        if (existingLead && existingLead.page_id && !user.pages.includes(String(existingLead.page_id))) {
          return res.status(403).json({ error: "Forbidden: Cannot assign lead belonging to an unassigned page" });
        }
      }

      const assignRes = await assignLeadAtomically(supabase, {
        leadId,
        pageId,
        eligibleStaffIds: Array.isArray(body.eligibleStaffIds) ? body.eligibleStaffIds : [],
        manualStaffId: staffId !== undefined ? staffId : null
      });

      if (assignRes.rejected) {
        return res.status(403).json({ error: assignRes.reason || "Target staff member is not eligible for this page" });
      }

      if (supabase && leadId && staffId !== undefined) {
        try {
          await supabase
            .from('leads')
            .update({ assigned_to: assignRes.assignedStaffId, updated_at: new Date().toISOString() })
            .eq('id', leadId);
        } catch (e) {}
      }
      return res.status(200).json({
        status: "success",
        assignedTo: assignRes.assignedStaffId,
        alreadyAssigned: Boolean(assignRes.alreadyAssigned),
        message: `Lead ${leadId} assigned to ${assignRes.assignedStaffId || 'Unassigned'}`,
        assignedAt: new Date().toISOString()
      });
    }

    const parsedFields = parseLeadFieldData(body);
    const contactRes = await findOrCreatePageScopedContact(supabase, {
      pageId: targetPage || 'manual',
      fullName: parsedFields.fullName,
      email: parsedFields.email,
      phone: parsedFields.phone
    });

    const leadPayload = {
      page_id: targetPage || null,
      contact_id: contactRes.contactId || null,
      assigned_to: body.assigned_to || body.assignedTo || null,
      full_name: parsedFields.fullName,
      email: parsedFields.email,
      phone: parsedFields.phone,
      source: body.source || 'Manual Entry',
      status: body.status || 'New',
      meta_lead_id: body.meta_lead_id || body.metaLeadId || null,
      form_id: body.form_id || body.formId || null,
      form_name: body.form_name || body.formName || null,
      campaign_id: body.campaign_id || body.campaignId || null,
      campaign_name: body.campaign_name || body.campaignName || null,
      ad_id: body.ad_id || body.adId || null,
      ad_name: body.ad_name || body.adName || null,
      adset_id: body.adset_id || body.adsetId || null,
      adset_name: body.adset_name || body.adsetName || null,
      custom_fields: parsedFields.customFields,
      vehicle_interest: body.vehicle_interest || parsedFields.vehicleInterest || null,
      budget_nzd: body.budget_nzd !== undefined ? Number(body.budget_nzd) || null : parsedFields.budgetNzd,
      payment_preference: body.payment_preference || parsedFields.paymentPreference || null,
      trade_in_info: body.trade_in_info || parsedFields.tradeInInfo || null,
      buying_timeframe: body.buying_timeframe || parsedFields.buyingTimeframe || null,
      lead_value: body.lead_value !== undefined ? Number(body.lead_value) || 0 : (body.sale_value_nzd !== undefined ? Number(body.sale_value_nzd) || 0 : 0),
      sale_value_nzd: body.sale_value_nzd !== undefined ? Number(body.sale_value_nzd) || null : null
    };

    const leadId = body.id || (leadPayload.meta_lead_id ? toDeterministicUuid(`lead_${leadPayload.meta_lead_id}`) : toDeterministicUuid(`lead_${Date.now()}_${Math.random()}`));
    leadPayload.id = leadId;
    leadPayload.raw_data = {
      ...(body.raw_data || {}),
      vehicle_interest: leadPayload.vehicle_interest,
      budget_nzd: leadPayload.budget_nzd,
      payment_preference: leadPayload.payment_preference,
      trade_in_info: leadPayload.trade_in_info,
      buying_timeframe: leadPayload.buying_timeframe,
      lead_value: leadPayload.lead_value,
      sale_value_nzd: leadPayload.sale_value_nzd,
      custom_fields: leadPayload.custom_fields,
      notes: body.notes || null,
      page_id: targetPage || null
    };

    if (supabase) {
      try {
        // Enforce idempotency if meta_lead_id is present
        if (leadPayload.meta_lead_id) {
          const { data: existing } = await supabase
            .from('leads')
            .select('*')
            .eq('meta_lead_id', leadPayload.meta_lead_id)
            .maybeSingle();

          if (existing) {
            const raw = (existing.raw_data && typeof existing.raw_data === 'object') ? existing.raw_data : {};
            return res.status(200).json({
              status: "success",
              lead: { ...raw, ...existing, name: existing.full_name || raw.full_name || 'Lead' },
              isExisting: true
            });
          }
        }

        const dbPayload = {
          id: leadId,
          full_name: leadPayload.full_name || leadPayload.name || 'Lead',
          email: leadPayload.email || null,
          phone: leadPayload.phone || null,
          status: leadPayload.status || 'New',
          source: leadPayload.source || 'Manual Entry',
          assigned_to: leadPayload.assigned_to || null,
          raw_data: leadPayload.raw_data || {}
        };
        if (leadPayload.page_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadPayload.page_id)) {
          dbPayload.page_id = leadPayload.page_id;
        }
        const { error: insertErr } = await safeDbUpsert(supabase, 'leads', dbPayload, 'id');
        if (insertErr) {
          console.warn('[Leads DB Upsert Warning]:', insertErr.message);
        }
      } catch (dbErr) {
        console.warn('[Leads DB Write Error]:', dbErr.message);
      }
    }

    const savedLead = {
      ...leadPayload.raw_data,
      ...leadPayload,
      id: leadId,
      name: leadPayload.full_name,
      pageId: leadPayload.page_id,
      createdAt: new Date().toISOString()
    };
    global.CRM_INGESTED_LEADS = global.CRM_INGESTED_LEADS || new Map();
    global.CRM_INGESTED_LEADS.set(leadId, savedLead);

    return res.status(201).json({
      status: "success",
      lead: savedLead
    });
  }

  // 4. PATCH /api/leads — Update Lead with Mandatory Server-Side Page Scoping Authorization
  if (req.method === 'PATCH') {
    const body = req.body || {};
    const leadId = body.id || req.query?.id;
    const bodyPageId = body.page_id || body.pageId;

    if (!leadId) {
      return res.status(400).json({ error: "Missing lead id" });
    }

    // Enforce page-level RBAC before any modification
    if (user.role !== 'admin' && !user.pages.includes('*')) {
      if (bodyPageId && !user.pages.includes(String(bodyPageId))) {
        return res.status(403).json({ error: "Forbidden: Cannot update lead on unassigned page" });
      }
      if (supabase) {
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id, page_id')
          .eq('id', leadId)
          .maybeSingle();
        if (existingLead && existingLead.page_id && !user.pages.includes(String(existingLead.page_id))) {
          return res.status(403).json({ error: "Forbidden: Lead belongs to an unassigned page" });
        }
        if (!existingLead && (!user.pages || user.pages.length === 0)) {
          return res.status(403).json({ error: "Forbidden: Staff member has no assigned pages" });
        }
      } else if (!user.pages || user.pages.length === 0) {
        return res.status(403).json({ error: "Forbidden: Staff member has no assigned pages" });
      }
    }

    const updates = { updated_at: new Date().toISOString() };
    const fieldMap = [
      'status', 'assigned_to', 'email', 'phone', 'vehicle_interest', 'budget_nzd',
      'payment_preference', 'trade_in_info', 'buying_timeframe', 'next_action_at',
      'next_action_note', 'appointment_at', 'appointment_status', 'loss_reason',
      'sale_value_nzd', 'lead_value', 'notes'
    ];
    fieldMap.forEach(f => {
      if (body[f] !== undefined) updates[f] = body[f];
    });
    if (body.full_name !== undefined || body.name !== undefined) updates.full_name = body.full_name || body.name;

    global.CRM_INGESTED_LEADS = global.CRM_INGESTED_LEADS || new Map();
    const existingMem = global.CRM_INGESTED_LEADS.get(leadId) || {};
    const mergedRaw = {
      ...(existingMem.raw_data || {}),
      ...(existingMem || {}),
      ...updates
    };
    updates.raw_data = mergedRaw;

    if (supabase) {
      try {
        const dbUpdates = {
          id: leadId,
          raw_data: mergedRaw
        };
        if (updates.full_name || updates.name) dbUpdates.full_name = updates.full_name || updates.name;
        if (updates.status) dbUpdates.status = updates.status;
        if (updates.email) dbUpdates.email = updates.email;
        if (updates.phone) dbUpdates.phone = updates.phone;
        if (updates.assigned_to) dbUpdates.assigned_to = updates.assigned_to;
        if (updates.page_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updates.page_id)) {
          dbUpdates.page_id = updates.page_id;
        }
        const { error: updateErr } = await safeDbUpsert(supabase, 'leads', dbUpdates, 'id');
        if (updateErr) {
          console.warn('[Leads DB Patch Warning]:', updateErr.message);
        }
      } catch (err) {
        console.warn('[Leads DB Patch Error]:', err.message);
      }
    }

    const updatedLead = {
      ...existingMem,
      ...updates,
      id: leadId,
      name: updates.full_name || existingMem.full_name || existingMem.name || 'Lead',
      pageId: updates.page_id || existingMem.page_id || existingMem.pageId
    };
    global.CRM_INGESTED_LEADS.set(leadId, updatedLead);

    return res.status(200).json({
      status: "success",
      lead: updatedLead
    });
  }

  // 5. GET /api/leads — Read Real Leads from Supabase & Zernio
  const zKey = process.env.ZERNIO_API_KEY;
  const now = Date.now();
  global.CRM_INGESTED_LEADS = global.CRM_INGESTED_LEADS || new Map();
  if (zKey && (global.CRM_INGESTED_LEADS.size === 0 || (now - (global.LAST_ZERNIO_LEADS_SYNC || 0) > 60000))) {
    try {
      global.LAST_ZERNIO_LEADS_SYNC = now;
      await syncZernioLeads({ apiKey: zKey, supabase: null, pageId: requestedPage, limitPerAccount: 50, skipDbWrite: true });
    } catch (e) {
      console.warn('[Leads Sync Error]:', e.message);
    }
  }

  let leads = [];
  if (supabase) {
    try {
      let query = supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (requestedPage) {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedPage)) {
          query = query.eq('page_id', requestedPage);
        }
      } else if (user.role !== 'admin' && !user.pages.includes('*')) {
        const staffPages = (user.pages && user.pages.length > 0) ? user.pages : [
          '6accd8b0d52dc43d8bf6034c', '6acd4daed19284a3227d7870', '6aea527fa5c031c687ccba15',
          '6aea5280a5c031c687ccba16', '6aea5280a5c031c687ccba17', '6aea5281a5c031c687ccba18'
        ];
        const uuidPages = staffPages.filter(p => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p));
        if (uuidPages.length > 0) {
          query = query.in('page_id', uuidPages);
        }
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        leads = data.map(l => {
          const raw = (l.raw_data && typeof l.raw_data === 'object') ? l.raw_data : {};
          return {
            ...raw,
            ...l,
            name: l.full_name || l.name || raw.full_name || raw.name || 'Unnamed Lead',
            vehicle_interest: l.vehicle_interest || raw.vehicle_interest || null,
            budget_nzd: l.budget_nzd !== undefined ? l.budget_nzd : (raw.budget_nzd !== undefined ? raw.budget_nzd : null),
            payment_preference: l.payment_preference || raw.payment_preference || null,
            trade_in_info: l.trade_in_info || raw.trade_in_info || null,
            buying_timeframe: l.buying_timeframe || raw.buying_timeframe || null,
            lead_value: l.lead_value !== undefined ? l.lead_value : (raw.lead_value !== undefined ? raw.lead_value : 0),
            sale_value_nzd: l.sale_value_nzd !== undefined ? l.sale_value_nzd : (raw.sale_value_nzd !== undefined ? raw.sale_value_nzd : null),
            pageId: l.page_id || raw.page_id,
            campaignId: l.campaign_id || raw.campaign_id,
            adsetId: l.adset_id || raw.adset_id,
            adId: l.ad_id || raw.ad_id,
            formId: l.form_id || raw.form_id,
            createdAt: l.created_at || raw.created_at
          };
        });
      } else if (error) {
        console.warn('[Leads DB Fetch Warning]:', error.message);
      }
    } catch (err) {
      console.warn('[Leads DB Query Error]:', err.message);
    }
  }

  // Merge in-memory leads from lead-ads ingestion or manual additions/patches
  if (global.CRM_INGESTED_LEADS && global.CRM_INGESTED_LEADS.size > 0) {
    const leadsMap = new Map(leads.map(l => [String(l.id), l]));
    for (const [memKey, memLead] of global.CRM_INGESTED_LEADS.entries()) {
      const memId = String(memLead.id || memKey);
      if (requestedPage && String(memLead.page_id || memLead.pageId) !== String(requestedPage)) continue;
      if (user.role !== 'admin' && !user.pages.includes('*')) {
        const lp = String(memLead.page_id || memLead.pageId || '');
        if (lp && user.pages && user.pages.length > 0 && !user.pages.includes(lp)) continue;
      }
      if (leadsMap.has(memId)) {
        const cur = leadsMap.get(memId);
        leadsMap.set(memId, {
          ...cur,
          ...memLead,
          name: memLead.full_name || memLead.name || cur.name
        });
      } else {
        leadsMap.set(memId, {
          ...memLead,
          id: memId,
          name: memLead.full_name || memLead.name || 'Unnamed Lead',
          pageId: memLead.page_id || memLead.pageId
        });
      }
    }
    leads = Array.from(leadsMap.values());
  }

  return res.status(200).json({
    status: "success",
    authorized: true,
    userRole: user.role,
    accessiblePages: user.pages,
    leads: leads,
    total: leads.length,
    timestamp: new Date().toISOString()
  });
}

module.exports = createVercelHandler(leadsHandler);
