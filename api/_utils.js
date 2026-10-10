const https = require('https');
const crypto = require('crypto');

// User-Page permission registry (synchronized with Supabase page_members / RBAC)
const USER_PERMISSIONS = {
  'admin': { role: 'admin', pages: ['*'], convs: ['*'] },
  'user_a': { role: 'staff', pages: ['page_01', 'page_a'], convs: ['conv_a1', 'c1'] },
  'user_b': { role: 'staff', pages: ['page_02', 'page_b'], convs: ['conv_b1', 'c2'] },
  'rahul': { role: 'staff', pages: ['page_01', 'page_02'], convs: [] },
  'amit': { role: 'staff', pages: ['page_03', 'page_04'], convs: [] },
  'priya': { role: 'staff', pages: ['page_05', 'page_06'], convs: [] }
};

function resolveUser(headers = {}) {
  const authHeader = headers['authorization'] || headers['Authorization'] || '';
  const userId = headers['x-user-id'] || headers['X-User-Id'] || 
    (authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '').trim() : '');
  
  if (!userId) return null;
  const normalized = userId.toLowerCase();
  return USER_PERMISSIONS[normalized] || { role: 'staff', pages: [normalized], convs: [] };
}

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400 || parsed.error) {
            reject(new Error(parsed.error ? (parsed.error.message || JSON.stringify(parsed.error)) : `HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

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

// Global in-memory cache for page tokens across serverless invocations
global.META_PAGE_TOKENS = global.META_PAGE_TOKENS || {};

/**
 * Universal Handler Adapter:
 * Automatically adapts between Vercel Serverless (req, res) and Netlify/Lambda (event, context).
 */
function createVercelHandler(fn) {
  const handler = async function(reqOrEvent, resOrContext) {
    // Detect Vercel execution (res has .status and .json methods)
    if (resOrContext && typeof resOrContext.status === 'function') {
      return fn(reqOrEvent, resOrContext);
    }

    // AWS Lambda / Netlify execution
    const event = reqOrEvent || {};
    const context = resOrContext || {};
    let statusCode = 200;
    let headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    };
    let body = '';

    const res = {
      status(code) { statusCode = code; return this; },
      setHeader(k, v) { headers[k] = v; return this; },
      redirect(codeOrUrl, maybeUrl) {
        if (typeof codeOrUrl === 'number') {
          statusCode = codeOrUrl;
          headers['Location'] = maybeUrl;
        } else {
          statusCode = 302;
          headers['Location'] = codeOrUrl;
        }
        return this;
      },
      json(data) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(data);
        return this;
      },
      send(data) {
        body = typeof data === 'string' ? data : JSON.stringify(data);
        return this;
      },
      end(data) {
        if (data) body = data;
        return this;
      }
    };

    let parsedBody = {};
    if (event.body) {
      if (typeof event.body === 'object') parsedBody = event.body;
      else {
        try { parsedBody = JSON.parse(event.body); } catch (e) { parsedBody = event.body; }
      }
    }

    const req = {
      method: event.httpMethod || 'GET',
      headers: event.headers || {},
      query: event.queryStringParameters || {},
      body: parsedBody,
      rawBody: typeof event.body === 'string' ? event.body : JSON.stringify(event.body || ''),
      url: event.path || '/'
    };

    await fn(req, res);
    return { statusCode, headers, body };
  };

  handler.handler = handler; // for exports.handler = ...
  return handler;
}

module.exports = {
  USER_PERMISSIONS,
  resolveUser,
  httpsRequest,
  verifyMetaSignature,
  createVercelHandler
};
