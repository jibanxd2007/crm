/**
 * Centralized Multi-Client Integrations Management API
 * 
 * Clean Reset State:
 * - All integrations start in 'disconnected' status
 * - Only administrators can connect, disconnect, or assign staff
 * - Refreshed credentials stored securely
 */

const { resolveUser, createVercelHandler } = require('./_utils/index.js');
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

// Default clean state integration templates (All Disconnected)
const CLEAN_INTEGRATION_TEMPLATES = [
  {
    id: 'int_meta_ads',
    provider: 'meta_ads',
    account_id: null,
    account_name: 'Meta / Facebook Business',
    status: 'disconnected',
    scopes: ['leads_retrieval', 'pages_read_engagement', 'pages_manage_metadata'],
    assigned_staff_ids: [],
    last_synced_at: null,
    next_sync_at: null,
    last_error: null,
    metadata: { channel: 'facebook', providerName: 'Meta Ads Manager & Lead Ads' }
  },
  {
    id: 'int_instagram',
    provider: 'instagram',
    account_id: null,
    account_name: 'Instagram Professional',
    status: 'disconnected',
    scopes: ['instagram_basic', 'instagram_manage_messages'],
    assigned_staff_ids: [],
    last_synced_at: null,
    next_sync_at: null,
    last_error: null,
    metadata: { channel: 'instagram', providerName: 'Instagram Direct & Lead Generation' }
  },
  {
    id: 'int_zernio',
    provider: 'zernio',
    account_id: null,
    account_name: 'Zernio Marketing Gateway',
    status: 'disconnected',
    scopes: ['messages', 'leads'],
    assigned_staff_ids: [],
    last_synced_at: null,
    next_sync_at: null,
    last_error: null,
    metadata: { gateway: 'zernio', providerName: 'Zernio Multi-Channel Gateway' }
  }
];

global.CRM_ACTIVE_INTEGRATIONS = global.CRM_ACTIVE_INTEGRATIONS || [...CLEAN_INTEGRATION_TEMPLATES];
let activeIntegrations = global.CRM_ACTIVE_INTEGRATIONS;

async function integrationsHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, x-user-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Authentication check
  const user = resolveUser(req.headers);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Authentication required." });
  }

  const query = req.query || {};
  const supabase = getSupabaseAdmin();
  const defaultOrgId = '00000000-0000-0000-0000-000000000001';

  // GET: List integrations
  if (req.method === 'GET') {
    let list = activeIntegrations;

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('integrations')
          .select('id, provider, account_id, account_name, status, scopes, assigned_staff_ids, last_synced_at, next_sync_at, last_error, metadata, created_at')
          .eq('organization_id', defaultOrgId);

        if (!error && data && data.length > 0) {
          list = data;
        }
      } catch (e) {
        console.warn("[Integrations DB Note]:", e.message);
      }
    }

    // Role-based filtering: staff only see integrations assigned to them
    const filtered = (user.role === 'admin' || user.pages.includes('*'))
      ? list
      : list.filter(item => {
          const assigned = item.assigned_staff_ids || [];
          return assigned.includes(user.id) || assigned.includes(user.email);
        });

    return res.status(200).json({
      status: "success",
      authorized: true,
      userRole: user.role,
      integrations: filtered,
      allDisconnected: filtered.every(i => i.status === 'disconnected'),
      timestamp: new Date().toISOString()
    });
  }

  // POST: Actions (connect, disconnect, sync, assign)
  if (req.method === 'POST') {
    const body = req.body || {};
    const action = body.action || query.action;
    const integrationId = body.id || body.integration_id || query.id;

    // Disconnect (Admin Only)
    if (action === 'disconnect') {
      if (user.role !== 'admin') {
        return res.status(403).json({ error: "Forbidden: Only administrators can disconnect integrations." });
      }

      if (global.META_PAGE_TOKENS) {
        global.META_PAGE_TOKENS = {};
      }

      if (supabase && integrationId) {
        await supabase
          .from('integrations')
          .update({ status: 'disconnected', updated_at: new Date().toISOString() })
          .eq('id', integrationId)
          .catch(() => {});
      }

      const found = activeIntegrations.find(i => i.id === integrationId);
      if (found) {
        found.status = 'disconnected';
        found.last_error = null;
      }

      return res.status(200).json({
        status: "success",
        message: `Integration disconnected safely. Stale credentials removed.`,
        id: integrationId
      });
    }

    // Assign staff (Admin Only)
    if (action === 'assign') {
      if (user.role !== 'admin') {
        return res.status(403).json({ error: "Forbidden: Only administrators can assign staff." });
      }

      const assignedStaffIds = body.assigned_staff_ids || body.staff_ids || [];
      if (supabase && integrationId) {
        await supabase
          .from('integrations')
          .update({ assigned_staff_ids: assignedStaffIds, updated_at: new Date().toISOString() })
          .eq('id', integrationId)
          .catch(() => {});
      }

      const found = activeIntegrations.find(i => i.id === integrationId);
      if (found) found.assigned_staff_ids = assignedStaffIds;

      return res.status(200).json({
        status: "success",
        message: "Staff assignments updated successfully",
        id: integrationId,
        assigned_staff_ids: assignedStaffIds
      });
    }

    // Connect / Reconnect integration (Admin Only)
    if (user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden: Only administrators can connect integrations." });
    }

    const newIntegration = {
      id: body.id || `int_${Date.now()}`,
      provider: body.provider || 'meta_ads',
      account_id: body.account_id || null,
      account_name: body.account_name || 'Connected Provider',
      status: 'connected',
      scopes: body.scopes || [],
      assigned_staff_ids: body.assigned_staff_ids || [],
      last_synced_at: new Date().toISOString(),
      metadata: body.metadata || {}
    };

    if (supabase) {
      await supabase
        .from('integrations')
        .upsert({
          organization_id: defaultOrgId,
          ...newIntegration,
          updated_at: new Date().toISOString()
        })
        .catch(() => {});
    }

    const existingIdx = activeIntegrations.findIndex(i => i.id === newIntegration.id || i.provider === newIntegration.provider);
    if (existingIdx >= 0) {
      activeIntegrations[existingIdx] = { ...activeIntegrations[existingIdx], ...newIntegration };
    } else {
      activeIntegrations.push(newIntegration);
    }

    return res.status(200).json({
      status: "success",
      integration: newIntegration
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

module.exports = createVercelHandler(integrationsHandler);
