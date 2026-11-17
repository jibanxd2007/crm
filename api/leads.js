const { resolveUser, createVercelHandler, safeDbUpsert } = require('./_utils/index.js');
const { assignLeadAtomically, findOrCreatePageScopedContact, parseLeadFieldData } = require('./_utils/lead-ingestion.js');
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
            return res.status(200).json({
              status: "success",
              lead: { ...existing, name: existing.full_name },
              isExisting: true
            });
          }
        }

        const { data: inserted, error: insertErr } = await supabase
          .from('leads')
          .insert(leadPayload)
          .select()
          .single();

        if (insertErr) {
          console.error('[Leads DB Insert Error]:', insertErr);
          return res.status(500).json({ error: insertErr.message });
        }

        return res.status(201).json({
          status: "success",
          lead: { ...inserted, name: inserted.full_name }
        });
      } catch (dbErr) {
        return res.status(500).json({ error: dbErr.message });
      }
    }

    return res.status(200).json({
      status: "success",
      lead: { id: `lead_${Date.now()}`, ...leadPayload, name: leadPayload.full_name, created_at: new Date().toISOString() }
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
      'sale_value_nzd', 'lead_value'
    ];
    fieldMap.forEach(f => {
      if (body[f] !== undefined) updates[f] = body[f];
    });
    if (body.full_name !== undefined || body.name !== undefined) updates.full_name = body.full_name || body.name;

    if (supabase) {
      try {
        const { data: updated, error: updateErr } = await supabase
          .from('leads')
          .update(updates)
          .eq('id', leadId)
          .select()
          .single();

        if (updateErr) {
          return res.status(500).json({ error: updateErr.message });
        }

        return res.status(200).json({
          status: "success",
          lead: { ...updated, name: updated.full_name }
        });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(200).json({ status: "success", lead: { id: leadId, ...updates } });
  }

  // 5. GET /api/leads — Read Real Leads from Supabase
  let leads = [];
  if (supabase) {
    try {
      let query = supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (requestedPage) {
        query = query.eq('page_id', requestedPage);
      } else if (user.role !== 'admin' && !user.pages.includes('*')) {
        if (!user.pages || user.pages.length === 0) {
          return res.status(200).json({
            status: "success",
            authorized: true,
            userRole: user.role,
            accessiblePages: [],
            leads: [],
            total: 0,
            timestamp: new Date().toISOString()
          });
        }
        query = query.in('page_id', user.pages);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        leads = data.map(l => ({
          ...l,
          name: l.full_name || l.name || 'Unnamed Lead',
          pageId: l.page_id,
          campaignId: l.campaign_id,
          adsetId: l.adset_id,
          adId: l.ad_id,
          formId: l.form_id,
          createdAt: l.created_at
        }));
      } else if (error) {
        console.warn('[Leads DB Fetch Warning]:', error.message);
      }
    } catch (err) {
      console.warn('[Leads DB Query Error]:', err.message);
    }
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
