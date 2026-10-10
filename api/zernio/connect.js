const { createVercelHandler } = require('../_utils.js');

async function zernioConnectHandler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const profileId = process.env.ZERNIO_PROFILE_ID;
  const clientId = process.env.META_APP_ID;
  const channel = req.query?.channel || (req.url && req.url.split('/').pop()) || 'facebook';

  if (!profileId || !clientId) {
    return res.status(500).json({
      error: "ZERNIO_PROFILE_ID and META_APP_ID must be configured in environment variables."
    });
  }

  const redirectUri = encodeURIComponent("https://zernio.com/api/v1/auth/facebook/callback");
  const state = encodeURIComponent(JSON.stringify({ profileId: profileId, channel: channel, source: "metacrm_vercel" }));

  let scopes = "pages_show_list,pages_read_engagement,pages_manage_metadata,leads_retrieval,pages_manage_ads";
  if (channel === 'instagram') {
    scopes += ",instagram_basic,instagram_manage_messages";
  } else if (channel === 'ads') {
    scopes += ",ads_read,ads_management";
  }

  const metaAuthUrl = `https://www.facebook.com/v24.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${encodeURIComponent(scopes)}&response_type=code`;

  return res.status(200).json({
    status: "success",
    channel: channel,
    clientId: clientId,
    authUrl: metaAuthUrl,
    gateway: "Zernio Meta Verified OAuth",
    timestamp: new Date().toISOString()
  });
}

module.exports = createVercelHandler(zernioConnectHandler);
