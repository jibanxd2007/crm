const { createClient } = require('@supabase/supabase-js');
const { resolveUser, createVercelHandler } = require('./_utils.js');

async function notificationsHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, X-User-Id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Mandatory Authentication
  const user = resolveUser(req.headers);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Authentication credentials required" });
  }

  const userId = (req.headers['x-user-id'] || req.headers['X-User-Id'] || '').toLowerCase();

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let userNotifications = [];

    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      let query = supabase.from('notifications').select('*');
      
      if (user.role !== 'admin') {
        query = query.eq('user_id', userId);
      }
      
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        userNotifications = data;
      }
    }

    return res.status(200).json({
      status: "success",
      userId: userId,
      role: user.role,
      notifications: userNotifications,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = createVercelHandler(notificationsHandler);
