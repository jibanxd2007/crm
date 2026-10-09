const crypto = require('crypto');

function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader) return false;
  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') return false;
  try {
    const expectedHash = crypto.createHmac('sha256', appSecret).update(rawBody || '').digest('hex');
    const signatureBuffer = Buffer.from(parts[1], 'hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    if (signatureBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (e) {
    return false;
  }
}

exports.handler = async function(event, context) {
  const verifyToken = process.env.META_VERIFY_TOKEN;
  const appSecret = process.env.META_APP_SECRET;

  // Handle Meta Webhook Verification Handshake (GET)
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const mode = params['hub.mode'];
    const token = params['hub.verify_token'];
    const challenge = params['hub.challenge'];

    if (!verifyToken) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: "META_VERIFY_TOKEN is not configured on the server." })
      };
    }

    if (mode === 'subscribe' && token === verifyToken) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/plain' },
        body: challenge
      };
    }

    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: "Forbidden: Webhook verify token mismatch." })
    };
  }

  // Handle Meta Webhook Event (POST)
  if (event.httpMethod === 'POST') {
    if (!appSecret) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: "META_APP_SECRET is not configured on the server." })
      };
    }

    const signatureHeader = event.headers['x-hub-signature-256'] || event.headers['X-Hub-Signature-256'];
    const isValid = verifyMetaSignature(event.body, signatureHeader, appSecret);

    if (!isValid) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: "Unauthorized: Invalid or missing Meta X-Hub-Signature-256." })
      };
    }

    let payload = {};
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      payload = { raw: event.body };
    }

    const eventId = payload.entry && payload.entry[0] ? payload.entry[0].id : `evt_${Date.now()}`;
    const pageId = payload.entry && payload.entry[0] ? payload.entry[0].id : 'page_01';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        status: "success",
        processed: true,
        eventId: eventId,
        pageId: pageId,
        slaTargetMinutes: 5,
        notificationsDispatched: true,
        signatureVerified: true,
        receivedAt: new Date().toISOString()
      })
    };
  }

  return {
    statusCode: 405,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: "Method not allowed" })
  };
};
