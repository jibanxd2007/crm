const { resolveUser, createVercelHandler } = require('./_utils.js');

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

  // 2. Fetch server-side registered pages (tokens strictly stripped)
  const registeredPages = [];
  if (global.META_PAGE_TOKENS) {
    for (const pid of Object.keys(global.META_PAGE_TOKENS)) {
      const p = global.META_PAGE_TOKENS[pid];
      if (user.role === 'admin' || user.pages.includes('*') || user.pages.includes(p.pageId)) {
        registeredPages.push({
          id: p.pageId,
          name: p.pageName,
          connectedAt: p.savedAt
        });
      }
    }
  }

  // 3. Return scoped pages
  return res.status(200).json({
    status: "success",
    authorized: true,
    userRole: user.role,
    accessiblePages: user.pages,
    pages: registeredPages,
    timestamp: new Date().toISOString()
  });
}

module.exports = createVercelHandler(pagesHandler);
