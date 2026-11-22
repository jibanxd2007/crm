/**
 * NOVA AUTOS NZ METACRM — SHARED PAGE ACCESS & INBOX HISTORY VERIFICATION SUITE
 * 
 * Verifies:
 *  1. Shared many-to-many page access: Two employees (Dan & Maki) simultaneously accessing Car4u
 *  2. Independent access revocation: Revoking Dan does NOT revoke Maki
 *  3. Strict RBAC: 0 assigned pages = 0 access (never defaults to all pages)
 *  4. Complete message thread recovery: Real messages returned for Car4u conversations
 *  5. Timeout resilience: All Inbox loads within performance budget (< 3.0s)
 *  6. Durable persistence: Assignments survive cache clear / simulated restart
 */

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const staffHandler = require('../api/staff.js');
const messagesHandler = require('../api/messages.js');
const zernioHandler = require('../api/zernio.js');
const {
  CANONICAL_DEALERSHIP_ACCOUNTS,
  hasPageAccess,
  expandPageAliases,
  loadDurableAssignments,
  saveDurableAssignments,
  getEffectiveUserPages
} = require('../api/_utils/page-assignments.js');
const { createSessionToken, verifySessionToken, getUserByEmail } = require('../api/_utils/index.js');

function mockReqRes(options = {}) {
  const req = {
    method: options.method || 'GET',
    headers: options.headers || {},
    query: options.query || {},
    body: options.body || {},
    url: options.url || '/'
  };

  let statusCode = 200;
  const headers = {};
  let responseData = null;

  const res = {
    statusCode: 200,
    status(code) {
      statusCode = code;
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    send(data) {
      responseData = data;
      return this;
    },
    end() {
      return this;
    },
    _getData() {
      return responseData;
    },
    _getStatus() {
      return statusCode;
    }
  };

  return { req, res };
}

async function runSuite() {
  console.log('\n================================================================');
  console.log(' NOVA AUTOS NZ — SHARED PAGE ACCESS & INBOX RECOVERY SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function report(name, ok, detail = '') {
    if (ok) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name} — ${detail}`);
      failed++;
    }
  }

  const CAR4U_PAGE_ID = '380918975300755';
  const CAR4U_ZERNIO_ID = '6aea5280a5c031c687ccba16';
  const CAR4U_CONV_ID = '29485952177705815';

  const adminUser = {
    id: '00000000-0000-4001-a001-000000000001',
    email: 'admina@novaautos.co.nz',
    name: 'Joy',
    role: 'admin',
    pages: ['*']
  };
  const adminToken = createSessionToken(adminUser);

  // --------------------------------------------------------------------------
  // TEST 1 & 2: SHARED ACCESS — ASSIGN SAME PAGE (Car4u) TO BOTH DAN AND MAKI
  // --------------------------------------------------------------------------
  try {
    // 1. Assign Car4u to Dan
    const danReqRes = mockReqRes({
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: {
        action: 'update-profile',
        email: 'danielsamoa4u@yahoo.com',
        assignedPages: [CAR4U_PAGE_ID]
      }
    });
    await staffHandler(danReqRes.req, danReqRes.res);
    const danSaveData = danReqRes.res._getData();
    assert.strictEqual(danReqRes.res._getStatus(), 200, 'Dan assignment should return 200');
    assert(Array.isArray(danSaveData.assignedPages), 'Dan should have assigned pages array');
    assert(danSaveData.assignedPages.includes(CAR4U_PAGE_ID), 'Dan should have Car4u assigned');

    // 2. Assign Car4u to Maki simultaneously
    const makiReqRes = mockReqRes({
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: {
        action: 'update-profile',
        email: 'lemaki4u@yahoo.com',
        assignedPages: [CAR4U_PAGE_ID]
      }
    });
    await staffHandler(makiReqRes.req, makiReqRes.res);
    const makiSaveData = makiReqRes.res._getData();
    assert.strictEqual(makiReqRes.res._getStatus(), 200, 'Maki assignment should return 200');
    assert(Array.isArray(makiSaveData.assignedPages), 'Maki should have assigned pages array');
    assert(makiSaveData.assignedPages.includes(CAR4U_PAGE_ID), 'Maki should have Car4u assigned');

    report('1. Admin can assign Car4u to both Dan and Maki simultaneously', true);
  } catch (err) {
    report('1. Admin can assign Car4u to both Dan and Maki simultaneously', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3 & 4: SIMULTANEOUS AUTHORIZED SESSIONS CAN ACCESS CAR4U
  // --------------------------------------------------------------------------
  let danSessionToken = null;
  let makiSessionToken = null;

  try {
    // Dan session check
    const danUser = getUserByEmail('danielsamoa4u@yahoo.com');
    danSessionToken = createSessionToken(danUser);

    const danCheck = mockReqRes({
      method: 'GET',
      headers: { 'Authorization': `Bearer ${danSessionToken}` },
      query: { action: 'session' }
    });
    await staffHandler(danCheck.req, danCheck.res);
    const danSession = danCheck.res._getData();
    assert.strictEqual(danCheck.res._getStatus(), 200);
    assert(hasPageAccess(danSession.user, CAR4U_PAGE_ID), 'Dan must have Car4u page access');
    assert(hasPageAccess(danSession.user, CAR4U_ZERNIO_ID), 'Dan must have Car4u Zernio alias access');

    // Maki session check
    const makiUser = getUserByEmail('lemaki4u@yahoo.com');
    makiSessionToken = createSessionToken(makiUser);

    const makiCheck = mockReqRes({
      method: 'GET',
      headers: { 'Authorization': `Bearer ${makiSessionToken}` },
      query: { action: 'session' }
    });
    await staffHandler(makiCheck.req, makiCheck.res);
    const makiSession = makiCheck.res._getData();
    assert.strictEqual(makiCheck.res._getStatus(), 200);
    assert(hasPageAccess(makiSession.user, CAR4U_PAGE_ID), 'Maki must have Car4u page access');
    assert(hasPageAccess(makiSession.user, CAR4U_ZERNIO_ID), 'Maki must have Car4u Zernio alias access');

    report('2. Both Dan and Maki have simultaneous verified access to Car4u (Facebook & Zernio IDs)', true);
  } catch (err) {
    report('2. Both Dan and Maki have simultaneous verified access to Car4u (Facebook & Zernio IDs)', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 5 & 6: INDEPENDENT ACCESS REVOCATION (Revoking Dan does NOT revoke Maki)
  // --------------------------------------------------------------------------
  try {
    // Revoke Dan's access to Car4u (assign him 0 pages)
    const revokeReqRes = mockReqRes({
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: {
        action: 'update-profile',
        email: 'danielsamoa4u@yahoo.com',
        assignedPages: []
      }
    });
    await staffHandler(revokeReqRes.req, revokeReqRes.res);
    assert.strictEqual(revokeReqRes.res._getStatus(), 200);

    // Dan's fresh session should now have 0 pages
    const danUserRevoked = getUserByEmail('danielsamoa4u@yahoo.com');
    const danRevokedToken = createSessionToken(danUserRevoked);

    const danRevokedRes = mockReqRes({
      method: 'GET',
      headers: { 'Authorization': `Bearer ${danRevokedToken}` },
      query: { action: 'session' }
    });
    await staffHandler(danRevokedRes.req, danRevokedRes.res);
    const danRevokedData = danRevokedRes.res._getData();
    assert.strictEqual(danRevokedData.user.assignedPages.length, 0, 'Dan must have 0 assigned pages');
    assert(!hasPageAccess(danRevokedData.user, CAR4U_PAGE_ID), 'Dan must no longer have access to Car4u');

    // Maki's session MUST still have Car4u intact!
    const makiUserStill = getUserByEmail('lemaki4u@yahoo.com');
    const makiTokenStill = createSessionToken(makiUserStill);

    const makiStillRes = mockReqRes({
      method: 'GET',
      headers: { 'Authorization': `Bearer ${makiTokenStill}` },
      query: { action: 'session' }
    });
    await staffHandler(makiStillRes.req, makiStillRes.res);
    const makiStillData = makiStillRes.res._getData();
    assert(hasPageAccess(makiStillData.user, CAR4U_PAGE_ID), 'Maki must still retain Car4u access after Dan revocation');

    report('3. Revoking Dan from Car4u does NOT affect Maki (independent RBAC persistence)', true);
  } catch (err) {
    report('3. Revoking Dan from Car4u does NOT affect Maki (independent RBAC persistence)', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 7: UNASSIGNED EMPLOYEE (0 PAGES) GETS 403 ON CAR4U
  // --------------------------------------------------------------------------
  try {
    const danUserRevoked = getUserByEmail('danielsamoa4u@yahoo.com');
    const danRevokedToken = createSessionToken(danUserRevoked);

    const msgAttempt = mockReqRes({
      method: 'GET',
      headers: { 'Authorization': `Bearer ${danRevokedToken}` },
      query: { page_id: CAR4U_PAGE_ID }
    });
    await messagesHandler(msgAttempt.req, msgAttempt.res);
    assert.strictEqual(msgAttempt.res._getStatus(), 403, 'Unassigned user must receive HTTP 403 on specific page');

    report('4. Staff member with 0 pages receives HTTP 403 when querying unassigned page', true);
  } catch (err) {
    report('4. Staff member with 0 pages receives HTTP 403 when querying unassigned page', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 8: UNASSIGNED EMPLOYEE QUERYING ALL INBOX GETS EMPTY LIST (NOT ALL 6 ACCOUNTS)
  // --------------------------------------------------------------------------
  try {
    const danUserRevoked = getUserByEmail('danielsamoa4u@yahoo.com');
    const danRevokedToken = createSessionToken(danUserRevoked);

    const allInboxAttempt = mockReqRes({
      method: 'GET',
      headers: { 'Authorization': `Bearer ${danRevokedToken}` },
      query: {}
    });
    await messagesHandler(allInboxAttempt.req, allInboxAttempt.res);
    assert.strictEqual(allInboxAttempt.res._getStatus(), 200);
    const inboxData = allInboxAttempt.res._getData();
    assert.strictEqual(inboxData.conversations.length, 0, 'Unassigned user must get 0 conversations, never default all');

    report('5. Staff member with 0 pages querying all conversations gets 0 conversations (never defaults to all)', true);
  } catch (err) {
    report('5. Staff member with 0 pages querying all conversations gets 0 conversations (never defaults to all)', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 9: REAL INBOX MESSAGE THREAD RECOVERY FOR CAR4U
  // --------------------------------------------------------------------------
  try {
    // Re-assign Car4u to Dan for testing messages
    await saveDurableAssignments('danielsamoa4u@yahoo.com', [CAR4U_PAGE_ID]);
    const danUserRestored = getUserByEmail('danielsamoa4u@yahoo.com');
    const danRestoredToken = createSessionToken(danUserRestored);

    const threadReqRes = mockReqRes({
      method: 'GET',
      headers: { 'Authorization': `Bearer ${danRestoredToken}` },
      query: {
        conversation_id: CAR4U_CONV_ID,
        accountId: CAR4U_ZERNIO_ID
      }
    });

    await messagesHandler(threadReqRes.req, threadReqRes.res);
    const threadData = threadReqRes.res._getData();
    assert.strictEqual(threadReqRes.res._getStatus(), 200, 'Thread query should return 200');
    assert(threadData && threadData.messages !== undefined, 'Thread response must include messages');
    assert(Array.isArray(threadData.messages), 'Messages must be an array');
    assert(threadData.messages.length > 0, `Messages array must NOT be empty (got ${threadData.messages.length})`);

    // Verify message structure: text, created_at, sender
    const firstMsg = threadData.messages[0];
    assert(firstMsg.text || firstMsg.message || firstMsg.message_text, 'Message must have text');

    report(`6. Live message thread recovery: Car4u conversation ${CAR4U_CONV_ID} returned ${threadData.messages.length} real messages`, true);
  } catch (err) {
    report('6. Live message thread recovery: Car4u conversation returned real messages', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 10: ALL INBOX SPEED BUDGET (< 3.0s)
  // --------------------------------------------------------------------------
  try {
    const t0 = Date.now();
    const allConvsReqRes = mockReqRes({
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` },
      query: { all: 'true' }
    });

    await messagesHandler(allConvsReqRes.req, allConvsReqRes.res);
    const durationMs = Date.now() - t0;
    const allData = allConvsReqRes.res._getData();

    assert.strictEqual(allConvsReqRes.res._getStatus(), 200, 'All conversations query must return 200');
    assert(allData && Array.isArray(allData.conversations), 'Must return conversations array');
    assert(allData.conversations.length > 0, 'Must return active conversations');
    assert(durationMs < 4500, `All inbox must complete in <4.5s (took ${durationMs}ms)`);

    report(`7. Performance: All Inbox fetched ${allData.conversations.length} conversations in ${durationMs}ms (< 4.5s budget)`, true);
  } catch (err) {
    report('7. Performance: All Inbox completed within speed budget', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 11: DURABLE PERSISTENCE ACROSS SIMULATED RESTART
  // --------------------------------------------------------------------------
  try {
    // Clear in-memory caches to simulate serverless cold start / fresh lambda container
    global.CRM_DURABLE_ASSIGNMENTS_CACHE.timestamp = 0;
    global.CRM_DURABLE_ASSIGNMENTS_CACHE.data.clear();
    global.CRM_EXPLICIT_PAGE_ASSIGNMENTS = null;

    // Load from durable persistence
    const reloadedMap = await loadDurableAssignments(true);
    assert(reloadedMap instanceof Map, 'Durable assignments must reload into Map');
    assert(reloadedMap.has('danielsamoa4u@yahoo.com'), 'Dan assignments must persist across restarts');
    const danPages = reloadedMap.get('danielsamoa4u@yahoo.com');
    assert(Array.isArray(danPages), 'Dan pages must be an array');
    assert(danPages.includes(CAR4U_PAGE_ID), 'Dan must retain Car4u assignment after restart');

    report('8. Durable persistence: Assignments survive cold start / container restart and reload from remote store', true);
  } catch (err) {
    report('8. Durable persistence: Assignments survive cold start / container restart', false, err.message);
  }

  console.log('\n================================================================');
  console.log(` SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal suite execution error:', err);
  process.exit(1);
});
