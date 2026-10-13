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

async function pagesHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, x-user-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Mandatory Authentication Check
  const user = resolveUser(req.headers);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Authentication credentials required" });
  }

  const registeredPages = [];

  // 2. Fetch from Supabase facebook_pages
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('facebook_pages')
        .select('id, page_id, page_name, page_username, page_picture, is_active, connected_at');

      if (!error && Array.isArray(data)) {
        for (const p of data) {
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
    } catch (err) {
      console.warn('[Pages DB Query Warning]:', err.message);
    }
  }

  // 3. Fallback to server-side registered page tokens if present
  if (global.META_PAGE_TOKENS) {
    for (const pid of Object.keys(global.META_PAGE_TOKENS)) {
      const p = global.META_PAGE_TOKENS[pid];
      if (!registeredPages.some(rp => rp.id === p.pageId)) {
        if (user.role === 'admin' || user.pages.includes('*') || user.pages.includes(p.pageId)) {
          registeredPages.push({
            id: p.pageId,
            name: p.pageName,
            platform: (p.pageName || '').toLowerCase().includes('insta') ? 'instagram' : 'facebook',
            connectedAt: p.savedAt
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
