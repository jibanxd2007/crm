const assert = require('assert');
const http = require('http');

// Load environment from .env if present
try {
  require('dotenv').config();
} catch (e) {}

const { resolveUser, createSessionToken, getUserByEmail } = require('../api/_utils/index.js');
const staffHandler = require('../api/staff.js');
const messagesHandler = require('../api/messages.js');
const leadsHandler = require('../api/leads.js');

function mockReqRes(options = {}) {
  const req = {
    method: options.method || 'GET',
    url: options.url || '/',
    headers: Object.assign({
      'content-type': 'application/json',
      'host': 'localhost'
    }, options.headers || {}),
    query: options.query || {},
    body: options.body || {}
  };

  let statusCode = 200;
  let responseData = null;
  const resHeaders = {};

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(key, val) {
      resHeaders[key.toLowerCase()] = val;
      return this;
    },
    json(obj) {
      responseData = obj;
      return this;
    },
    send(str) {
      responseData = str;
      return this;
    },
    end() {
      return this;
    },
    getStatusCode: () => statusCode,
    getData: () => responseData,
    getHeaders: () => resHeaders
  };

  return { req, res };
}

async function runTests() {
  console.log('\n================================================================');
  console.log(' DEALERSHIP PAGE ASSIGNMENT & RBAC RELIABILITY SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.message}`);
      if (err.stack) {
        console.error(`         ${err.stack.split('\n').slice(1, 3).join('\n')}`);
      }
      failed++;
    }
  }

  const danEmail = 'danielsamoa4u@yahoo.com';
  const targetPage1 = '6accd8b0d52dc43d8bf6034c'; // Nova cars Samoa nz
  const targetPage2 = '6acd4daed19284a3227d7870'; // Nova auto nz
  const danInitial = getUserByEmail(danEmail);
  const originalAssigned = danInitial ? [...(danInitial.assignedPages || [])] : ['*'];

  // 1. Admin can assign Dan to a specific single page
  await test('1. Admin can assign staff member to a single specific page', async () => {
    const adminUser = getUserByEmail('admina@novaautos.co.nz');
    const adminToken = createSessionToken(adminUser);

    const { req, res } = mockReqRes({
      method: 'POST',
      url: '/api/staff',
      headers: { authorization: `Bearer ${adminToken}` },
      body: {
        action: 'update-profile',
        email: danEmail,
        assignedPages: [targetPage1]
      }
    });

    await staffHandler(req, res);
    assert.strictEqual(res.getStatusCode(), 200, `Expected 200, got ${res.getStatusCode()}: ${JSON.stringify(res.getData())}`);
    const data = res.getData();
    assert.strictEqual(data.success, true);
    assert.deepStrictEqual(data.assignedPages, [targetPage1]);
  });

  // 2. Dan's resolved session reflects only that assigned page
  await test('2. Staff session resolver reflects strictly assigned page', async () => {
    const danUser = getUserByEmail(danEmail);
    const danToken = createSessionToken(danUser);

    const resolved = resolveUser({ authorization: `Bearer ${danToken}` });
    assert.ok(resolved, 'User should resolve');
    assert.strictEqual(resolved.role, 'staff');
    assert.deepStrictEqual(resolved.pages, [targetPage1]);
  });

  // 3. Dan can access messages for assigned page, but gets 403 on unassigned page
  await test('3. Staff can access messages for assigned page, 403 for unassigned page', async () => {
    const danUser = getUserByEmail(danEmail);
    const danToken = createSessionToken(danUser);

    // Unassigned page access attempt
    const { req: req403, res: res403 } = mockReqRes({
      method: 'GET',
      url: `/api/messages?page_id=${targetPage2}`,
      query: { page_id: targetPage2 },
      headers: { authorization: `Bearer ${danToken}` }
    });
    await messagesHandler(req403, res403);
    assert.strictEqual(res403.getStatusCode(), 403, `Expected 403 for unassigned page, got ${res403.getStatusCode()}`);

    // Assigned page access attempt
    const { req: req200, res: res200 } = mockReqRes({
      method: 'GET',
      url: `/api/messages?page_id=${targetPage1}`,
      query: { page_id: targetPage1 },
      headers: { authorization: `Bearer ${danToken}` }
    });
    await messagesHandler(req200, res200);
    assert.strictEqual(res200.getStatusCode(), 200, `Expected 200 for assigned page, got ${res200.getStatusCode()}`);
  });

  // 4. Admin can unassign all pages (0 pages selected)
  await test('4. Admin can unassign staff from all pages (empty list does not revert to all pages)', async () => {
    const adminUser = getUserByEmail('admina@novaautos.co.nz');
    const adminToken = createSessionToken(adminUser);

    const { req, res } = mockReqRes({
      method: 'POST',
      url: '/api/staff',
      headers: { authorization: `Bearer ${adminToken}` },
      body: {
        action: 'update-profile',
        email: danEmail,
        assignedPages: []
      }
    });

    await staffHandler(req, res);
    assert.strictEqual(res.getStatusCode(), 200);
    const data = res.getData();
    assert.deepStrictEqual(data.assignedPages, []);

    // Verify resolveUser gives empty array []
    const danUser = getUserByEmail(danEmail);
    const danToken = createSessionToken(danUser);
    const resolved = resolveUser({ authorization: `Bearer ${danToken}` });
    assert.ok(resolved);
    assert.strictEqual(resolved.role, 'staff');
    assert.deepStrictEqual(resolved.pages, [], 'Unassigned staff must have empty pages array, not fallback to canonical pages');
  });

  // 5. Unassigned staff member gets 403 on all pages and 0 conversations on general query
  await test('5. Unassigned staff member is blocked from accessing any page', async () => {
    const danUser = getUserByEmail(danEmail);
    const danToken = createSessionToken(danUser);

    const { req: req403, res: res403 } = mockReqRes({
      method: 'GET',
      url: `/api/messages?page_id=${targetPage1}`,
      query: { page_id: targetPage1 },
      headers: { authorization: `Bearer ${danToken}` }
    });
    await messagesHandler(req403, res403);
    assert.strictEqual(res403.getStatusCode(), 403);

    // General conversation query returns empty list
    const { req: reqEmpty, res: resEmpty } = mockReqRes({
      method: 'GET',
      url: '/api/messages',
      query: {},
      headers: { authorization: `Bearer ${danToken}` }
    });
    await messagesHandler(reqEmpty, resEmpty);
    assert.strictEqual(resEmpty.getStatusCode(), 200);
    const data = resEmpty.getData();
    assert.deepStrictEqual(data.conversations, []);
  });

  // 6. Admin can restore full access with '*'
  await test('6. Admin can assign wildcard * (Full Access)', async () => {
    const adminUser = getUserByEmail('admina@novaautos.co.nz');
    const adminToken = createSessionToken(adminUser);

    const { req, res } = mockReqRes({
      method: 'POST',
      url: '/api/staff',
      headers: { authorization: `Bearer ${adminToken}` },
      body: {
        action: 'update-profile',
        email: danEmail,
        assignedPages: ['*']
      }
    });

    await staffHandler(req, res);
    assert.strictEqual(res.getStatusCode(), 200);
    const data = res.getData();
    assert.deepStrictEqual(data.assignedPages, ['*']);

    const danUser = getUserByEmail(danEmail);
    const danToken = createSessionToken(danUser);
    const resolved = resolveUser({ authorization: `Bearer ${danToken}` });
    assert.ok(resolved.pages.includes('*'), 'User must have wildcard access');
  });

  // Cleanup: restore original assignment
  const adminUser = getUserByEmail('admina@novaautos.co.nz');
  const adminToken = createSessionToken(adminUser);
  const { req: cleanReq, res: cleanRes } = mockReqRes({
    method: 'POST',
    url: '/api/staff',
    headers: { authorization: `Bearer ${adminToken}` },
    body: {
      action: 'update-profile',
      email: danEmail,
      assignedPages: originalAssigned
    }
  });
  await staffHandler(cleanReq, cleanRes);

  console.log(`\n================================================================`);
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`================================================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
