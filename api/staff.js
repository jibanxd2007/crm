const { resolveUser, createVercelHandler } = require('./_utils.js');

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

  return res.status(200).json({
    status: "success",
    authorized: true,
    userRole: user.role,
    count: 0,
    staff: [],
    timestamp: new Date().toISOString()
  });
}

module.exports = createVercelHandler(staffHandler);
