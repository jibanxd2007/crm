const { resolveUser, createVercelHandler } = require('./_utils.js');

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

  if (req.method === 'POST') {
    const body = req.body || {};
    const targetPage = body.page_id || body.pageId;

    if (targetPage && user.role !== 'admin' && !user.pages.includes('*') && !user.pages.includes(targetPage)) {
      return res.status(403).json({
        error: "Forbidden: Cannot create or modify leads for unassigned page"
      });
    }

    if (body.action === 'assign' || (req.url && req.url.includes('/assign'))) {
      return res.status(200).json({
        status: "success",
        message: `Lead ${body.leadId} assigned to staff ${body.staffId}`,
        assignedAt: new Date().toISOString()
      });
    }

    return res.status(200).json({
      status: "success",
      lead: { id: `lead_${Date.now()}`, ...body, createdAt: new Date().toISOString() }
    });
  }

  // GET /api/leads
  return res.status(200).json({
    status: "success",
    authorized: true,
    userRole: user.role,
    accessiblePages: user.pages,
    leads: [],
    timestamp: new Date().toISOString()
  });
}

module.exports = createVercelHandler(leadsHandler);
