const https = require('https');

exports.handler = async function(event, context) {
  const apiKey = process.env.ZERNIO_API_KEY || "sk_70e384c607a377dd9cc9e1585a8def99688e735a3a47d515b2255808055dabe1";
  const profileId = process.env.ZERNIO_PROFILE_ID || "6ac64ff53904c4c3acfa60fd";
  const channel = (event.queryStringParameters && event.queryStringParameters.channel) || 'facebook';

  // Verified Meta OAuth dialog URL with registered Facebook Client ID: 712341431446535
  const clientId = "712341431446535";
  const redirectUri = encodeURIComponent("https://zernio.com/api/v1/auth/facebook/callback");
  const state = encodeURIComponent(JSON.stringify({ profileId: profileId, channel: channel, source: "metacrm_netlify" }));

  let scopes = "pages_show_list,pages_read_engagement,pages_manage_metadata,leads_retrieval,pages_manage_ads";
  if (channel === 'instagram') {
    scopes += ",instagram_basic,instagram_manage_messages";
  } else if (channel === 'ads') {
    scopes += ",ads_read,ads_management";
  }

  const metaAuthUrl = `https://www.facebook.com/v24.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${encodeURIComponent(scopes)}&response_type=code`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      status: "success",
      channel: channel,
      clientId: clientId,
      authUrl: metaAuthUrl,
      gateway: "Zernio Meta Verified OAuth",
      timestamp: new Date().toISOString()
    })
  };
};
