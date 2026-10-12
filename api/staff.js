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

async function staffHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, x-user-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Mandatory Authentication
  const user = resolveUser(req.headers);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Authentication credentials required" });
  }

  let staffList = [];
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, role, avatar_url, created_at')
        .order('created_at', { ascending: true });

      if (!error && Array.isArray(data)) {
        staffList = data.map(u => ({
          id: u.id,
          name: u.full_name || u.email.split('@')[0],
          displayName: u.full_name || u.email.split('@')[0],
          email: u.email,
          role: u.role || 'staff',
          avatarUrl: u.avatar_url,
          assignedPages: []
        }));
      }
    } catch (err) {
      console.warn('[Staff Query Warning]:', err.message);
    }
  }

  return res.status(200).json({
    status: "success",
    authorized: true,
    userRole: user.role,
    count: staffList.length,
    staff: staffList,
    timestamp: new Date().toISOString()
  });
}

module.exports = createVercelHandler(staffHandler);
