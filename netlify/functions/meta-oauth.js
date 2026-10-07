exports.handler = async function(event, context) {
  const clientId = process.env.META_APP_ID || "712341431446535";
  const host = event.headers.host || "serene-toffee-fe3244.netlify.app";
  const redirectUri = process.env.META_REDIRECT_URI || `https://${host}/api/meta/callback`;
  const state = (event.queryStringParameters && event.queryStringParameters.state) || Math.random().toString(36).substring(7);

  const scopes = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_metadata",
    "pages_messaging",
    "leads_retrieval",
    "ads_read",
    "ads_management",
    "instagram_basic",
    "instagram_manage_messages"
  ].join(",");

  const oauthUrl = `https://www.facebook.com/v24.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${encodeURIComponent(scopes)}&response_type=code`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      url: oauthUrl,
      clientId: clientId,
      redirectUri: redirectUri,
      state: state
    })
  };
};
