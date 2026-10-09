// Netlify Serverless Function: Facebook / Meta Pages List (Scoped by Role & Permissions)
const USER_PERMISSIONS = {
  'admin': { role: 'admin', pages: ['*'] },
  'user_a': { role: 'staff', pages: ['page_01', 'page_a'] },
  'user_b': { role: 'staff', pages: ['page_02', 'page_b'] },
  'rahul': { role: 'staff', pages: ['page_01', 'page_02'] },
  'amit': { role: 'staff', pages: ['page_03', 'page_04'] },
  'priya': { role: 'staff', pages: ['page_05', 'page_06'] }
};

function resolveUser(headers) {
  const authHeader = headers['authorization'] || headers['Authorization'] || '';
  const userId = headers['x-user-id'] || headers['X-User-Id'] || (authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '').trim() : '');
  if (!userId) return null;
  const normalized = userId.toLowerCase();
  return USER_PERMISSIONS[normalized] || { role: 'staff', pages: [normalized] };
}

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
      body: JSON.stringify({ error: "Unauthorized: Authentication credentials required" })
    };
  }

  // 2. Return scoped pages
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      status: "success",
      authorized: true,
      userRole: user.role,
      accessiblePages: user.pages,
      pages: [],
      timestamp: new Date().toISOString()
    })
  };
};
