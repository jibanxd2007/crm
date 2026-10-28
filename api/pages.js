const { resolveUser, createVercelHandler, toDeterministicUuid } = require('./_utils/index.js');
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

if (!global.CRM_REGISTERED_PAGES) global.CRM_REGISTERED_PAGES = new Map();
if (!global.META_PAGE_TOKENS) global.META_PAGE_TOKENS = {};

async function pagesHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, x-user-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Mandatory Authentication Check
  const user = resolveUser(req.headers);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Authentication credentials required" });
  }

  const supabase = getSupabaseAdmin();
  const adminUserId = '00000000-0000-4001-a001-000000000001';

  // 2. POST: Connect or Disconnect Page (Admin Only)
  if (req.method === 'POST') {
    if (user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden: Only administrators can modify pages." });
    }

    const body = (typeof req.body === 'object' && req.body !== null) ? req.body : {};
    const action = body.action || req.query.action || 'connect';
    const pageId = String(body.page_id || body.id || req.query.page_id || '');

    // Disconnect Page
    if (action === 'disconnect') {
      if (!pageId) {
        return res.status(400).json({ error: "page_id is required to disconnect a page." });
      }

      if (supabase) {
        try {
          await supabase
            .from('facebook_pages')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .or(`page_id.eq.${pageId},id.eq.${pageId}`);
        } catch (dbErr) {
          console.warn('[Pages DB Disconnect Warning]:', dbErr.message);
        }
      }

      global.CRM_REGISTERED_PAGES.delete(pageId);
      if (global.META_PAGE_TOKENS) delete global.META_PAGE_TOKENS[pageId];

      return res.status(200).json({
        status: "success",
        message: `Page ${pageId} disconnected successfully.`,
        pageId
      });
    }

    // Connect / Sync Pages
    const pagesToConnect = Array.isArray(body.pages) ? body.pages : (pageId ? [body] : []);
    const saved = [];

    for (const p of pagesToConnect) {
      const pId = String(p.page_id || p.id || '');
      if (!pId) continue;
      const pName = p.page_name || p.name || 'Connected Page';
      const pageDbId = toDeterministicUuid(`fb_page_${pId}`);
      const connId = toDeterministicUuid(`meta_conn_${pId}`);
      const platform = p.platform || (pName.toLowerCase().includes('insta') ? 'instagram' : 'facebook');

      if (supabase) {
        try {
          await supabase
            .from('facebook_pages')
            .upsert({
              id: pageDbId,
              user_id: adminUserId,
              meta_connection_id: connId,
              page_id: pId,
              page_name: pName,
              page_username: p.username || (platform === 'instagram' ? pName : null),
              page_picture: p.picture || null,
              page_access_token: p.token || p.access_token || null,
              is_active: true,
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,page_id' });

          await supabase
            .from('page_members')
            .upsert({
              id: toDeterministicUuid(`pm_${pageDbId}_${adminUserId}`),
              page_id: pageDbId,
              user_id: adminUserId,
              role: 'owner'
            }, { onConflict: 'page_id,user_id' });
        } catch (dbErr) {
          console.warn('[Pages DB Connect Warning]:', dbErr.message);
        }
      }

      const registered = {
        id: pId,
        page_id: pId,
        dbId: pageDbId,
        name: pName,
        username: p.username || null,
        picture: p.picture || null,
        platform: platform,
        is_active: true,
        connectedAt: new Date().toISOString()
      };

      global.CRM_REGISTERED_PAGES.set(pId, registered);
      saved.push(registered);
    }

    return res.status(200).json({
      status: "success",
      message: `${saved.length} page(s) registered successfully.`,
      pages: saved
    });
  }

  // 3. GET: List Scoped Active Pages
  const registeredPages = [];

  // 3a. Fetch from Supabase facebook_pages
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('facebook_pages')
        .select('id, page_id, page_name, page_username, page_picture, is_active, connected_at');

      if (!error && Array.isArray(data)) {
        for (const p of data) {
          if (p.is_active !== false) {
            if (user.role === 'admin' || user.pages.includes('*') || user.pages.includes(p.page_id) || user.pages.includes(p.id)) {
              registeredPages.push({
                id: p.page_id || p.id,
                dbId: p.id,
                name: p.page_name,
                username: p.page_username,
                picture: p.page_picture,
                platform: (p.page_name || '').toLowerCase().includes('insta') ? 'instagram' : 'facebook',
                connectedAt: p.connected_at
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Pages DB Query Warning]:', err.message);
    }
  }

  // 3b. Fallback to server-side registered page tokens if present
  if (global.META_PAGE_TOKENS) {
    for (const pid of Object.keys(global.META_PAGE_TOKENS)) {
      const p = global.META_PAGE_TOKENS[pid];
      if (!registeredPages.some(rp => rp.id === p.pageId || rp.id === pid)) {
        if (user.role === 'admin' || user.pages.includes('*') || user.pages.includes(p.pageId) || user.pages.includes(pid)) {
          registeredPages.push({
            id: p.pageId || pid,
            name: p.pageName,
            platform: (p.pageName || '').toLowerCase().includes('insta') ? 'instagram' : 'facebook',
            connectedAt: p.savedAt
          });
        }
      }
    }
  }

  // 3c. Fallback to global.CRM_REGISTERED_PAGES cache
  if (global.CRM_REGISTERED_PAGES) {
    for (const [pId, p] of global.CRM_REGISTERED_PAGES.entries()) {
      if (p.is_active !== false && !registeredPages.some(rp => rp.id === pId || rp.id === p.id || rp.id === p.page_id)) {
        if (user.role === 'admin' || user.pages.includes('*') || user.pages.includes(pId) || user.pages.includes(p.id)) {
          registeredPages.push({
            id: p.page_id || p.id || pId,
            dbId: p.dbId || p.id,
            name: p.name,
            username: p.username,
            picture: p.picture,
            platform: p.platform || ((p.name || '').toLowerCase().includes('insta') ? 'instagram' : 'facebook'),
            connectedAt: p.connectedAt || p.connected_at || new Date().toISOString()
          });
        }
      }
    }
  }

  // 4. Return scoped pages
  return res.status(200).json({
    status: "success",
    authorized: true,
    userRole: user.role,
    accessiblePages: user.pages,
    pages: registeredPages,
    total: registeredPages.length,
    timestamp: new Date().toISOString()
  });
}

module.exports = createVercelHandler(pagesHandler);

