const { resolveUser, createVercelHandler } = require('./_utils.js');
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

    if (body.action === 'assign' || (req.url && req.url.includes('/assign'))) {
      const leadId = body.leadId || body.id;
      const staffId = body.staffId || body.assignedTo;
      if (supabase && leadId) {
        await supabase
          .from('leads')
          .update({ assigned_to: staffId, updated_at: new Date().toISOString() })
          .eq('id', leadId)
          .catch(() => {});
      }
      return res.status(200).json({
        status: "success",
        message: `Lead ${leadId} assigned to staff ${staffId}`,
        assignedAt: new Date().toISOString()
      });
    }

    const leadPayload = {
      full_name: (body.full_name || body.name || 'New Lead').trim(),
      email: body.email ? body.email.trim() : null,
      phone: body.phone ? body.phone.trim() : null,
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
      adset_name: body.adset_name || body.adsetName || null
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

  // 4. PATCH /api/leads — Update Lead (Status, Notes, Assignment)
  if (req.method === 'PATCH') {
    const body = req.body || {};
    const leadId = body.id || req.query?.id;

    if (!leadId) {
      return res.status(400).json({ error: "Missing lead id" });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (body.status) updates.status = body.status;
    if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;
    if (body.email !== undefined) updates.email = body.email;
    if (body.phone !== undefined) updates.phone = body.phone;
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
