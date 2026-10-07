const USER_PERMISSIONS = {
  'admin': { role: 'admin', pages: ['*'] },
  'user_a': { role: 'staff', pages: ['page_01', 'page_a'], convs: ['conv_a1', 'c1'] },
  'user_b': { role: 'staff', pages: ['page_02', 'page_b'], convs: ['conv_b1', 'c2'] }
};

function resolveUser(headers) {
  const authHeader = headers['authorization'] || headers['Authorization'] || '';
  const userId = headers['x-user-id'] || headers['X-User-Id'] || (authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '').trim() : '');
  if (!userId) return null;
  const normalized = userId.toLowerCase();
  return USER_PERMISSIONS[normalized] || { role: 'staff', pages: [normalized], convs: [] };
}

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id'
      },
      body: ''
    };
  }

  // 1. Mandatory Authentication Check
  const user = resolveUser(event.headers);
  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: "Unauthorized: Authentication required" })
    };
  }

  const params = event.queryStringParameters || {};
  const requestedPage = params.page_id || params.pageId;
  const requestedConv = params.conversation_id || params.conversationId;

  // 2. Authorization Check
  if (user.role !== 'admin' && !user.pages.includes('*')) {
    if (requestedPage && !user.pages.includes(requestedPage)) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: "Forbidden: Cannot access conversations for unassigned page", requestedPage })
      };
    }
    if (requestedConv && user.convs && user.convs.length > 0 && !user.convs.includes(requestedConv)) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: "Forbidden: Cannot access messages for unassigned conversation", requestedConv })
      };
    }
  }

  if (event.httpMethod === 'POST') {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch(e) {}

    const targetPage = body.page_id || body.pageId;
    if (targetPage && user.role !== 'admin' && !user.pages.includes('*') && !user.pages.includes(targetPage)) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: "Forbidden: Cannot send messages through unauthorized page" })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        status: "sent",
        messageId: `msg_${Date.now()}`,
        recipient: body.recipientId || "customer",
        content: body.text || "",
        sentAt: new Date().toISOString()
      })
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      status: "success",
      authorized: true,
      userRole: user.role,
      channels: ["Messenger", "Instagram Direct"],
      conversations: [],
      timestamp: new Date().toISOString()
    })
  };
};
