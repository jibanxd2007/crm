const { resolveUser, createVercelHandler } = require('./_utils.js');

async function campaignsHandler(req, res) {
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

  const requestedPage = req.query?.page_id || req.query?.pageId;

  // 2. Authorization Check for Page Scoping
  if (requestedPage && user.role !== 'admin' && !user.pages.includes('*')) {
    if (!user.pages.includes(requestedPage)) {
      return res.status(403).json({
        error: "Forbidden: Access denied to campaigns for unassigned page",
        requestedPage: requestedPage,
        userRole: user.role
      });
    }
  }

  return res.status(200).json({
    status: "success",
    authorized: true,
    userRole: user.role,
    accessiblePages: user.pages,
    count: 0,
    campaigns: [],
    timestamp: new Date().toISOString()
  });
}

module.exports = createVercelHandler(campaignsHandler);
