const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

exports.handler = async function(event, context) {
  const params = event.queryStringParameters || {};
  const code = params.code;
  const error = params.error;
  const errorDesc = params.error_description;

  if (error) {
    return {
      statusCode: 302,
      headers: { 'Location': `/?meta_auth=error&msg=${encodeURIComponent(errorDesc || error)}` },
      body: ''
    };
  }

  if (!code) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: "Missing authorization code" })
    };
  }

  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;
  if (!clientId || !clientSecret) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: "META_APP_ID or META_APP_SECRET is not configured on the server." })
    };
  }
  const host = event.headers.host || "serene-toffee-fe3244.netlify.app";
  const redirectUri = process.env.META_REDIRECT_URI || `https://${host}/api/meta/callback`;

  try {
    let tokenData = { access_token: `mock_token_${Date.now()}` };
    if (clientSecret) {
      const tokenUrl = `https://graph.facebook.com/v24.0/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
      tokenData = await httpsGet(tokenUrl);
    }

    return {
      statusCode: 302,
      headers: {
        'Location': `/#connections?meta_auth=success&connected=true`
      },
      body: ''
    };
  } catch (err) {
    return {
      statusCode: 302,
      headers: { 'Location': `/#connections?meta_auth=error&msg=${encodeURIComponent(err.message)}` },
      body: ''
    };
  }
};
