// Netlify Serverless Function: Meta / Facebook OAuth Initiator
exports.handler = async function(event, context) {
  const clientId = process.env.META_APP_ID;
  if (!clientId) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        error: "META_APP_ID is not configured in Netlify environment variables.",
        help: "Please set META_APP_ID in Netlify Site Configuration -> Environment variables."
      })
    };
  }

  const host = event.headers.host || "serene-toffee-fe3244.netlify.app";
  const redirectUri = process.env.META_REDIRECT_URI || `https://${host}/api/meta/callback`;
  const state = (event.queryStringParameters && event.queryStringParameters.state) || Math.random().toString(36).substring(7);

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

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      status: "success",
      url: oauthUrl,
      clientId: clientId,
      redirectUri: redirectUri,
      state: state
    })
  };
};
