const { createVercelHandler } = require('../_utils.js');

async function metaOAuthHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const clientId = process.env.META_APP_ID;
  if (!clientId) {
    return res.status(500).json({
      error: "META_APP_ID is not configured in environment variables.",
      help: "Please set META_APP_ID in your Vercel Project Settings -> Environment Variables."
    });
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || process.env.VERCEL_URL || "localhost:3000";
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = process.env.META_REDIRECT_URI || `${proto}://${host}/api/meta/callback`;
  const state = req.query?.state || Math.random().toString(36).substring(7);

  // Exact permissions required for leads retrieval and messaging
  const scopes = [
    "public_profile",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_metadata",
    "pages_messaging",
    "leads_retrieval",
    "instagram_basic",
    "instagram_manage_messages"
  ].join(",");

  const oauthUrl = `https://www.facebook.com/v24.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scopes)}&response_type=code`;

  if (req.query?.redirect === 'true') {
    return res.redirect(oauthUrl);
  }

  return res.status(200).json({
    status: "success",
    url: oauthUrl,
    clientId: clientId,
    redirectUri: redirectUri,
    state: state
  });
}

module.exports = createVercelHandler(metaOAuthHandler);
