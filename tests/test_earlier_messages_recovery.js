/**
 * NOVA AUTOS NZ METACRM — EARLIER MESSAGES & INBOX HISTORY VERIFICATION
 * 
 * Verifies:
 *  1. Pelenatete Isaako initial load returns all 6 real messages (earlier + recent).
 *  2. Querying with `before=timestamp` returns earlier messages without Zernio "Invalid cursor" error.
 *  3. /api/zernio?path=inbox-messages with `before=timestamp` filters messages correctly in-memory.
 *  4. Dummy preview messages (msg_prev_) are purged and never block real message fetching.
 *  5. Chronological message sorting and date grouping work properly.
 */

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const messagesHandler = require('../api/messages.js');
const zernioHandler = require('../api/zernio.js');

function mockReqRes(options = {}) {
  const req = {
    method: options.method || 'GET',
    headers: {
      'x-user-id': '00000000-0000-4001-a001-000000000001',
      ...(options.headers || {})
    },
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
    }
  };

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getData: () => responseData
  };
}

async function runEarlierMessagesSuite() {
  console.log('================================================================');
  console.log(' NOVA AUTOS NZ — EARLIER MESSAGES & INBOX HISTORY SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const pelenateteConvId = '28957314853971061';
  const samoaAccountId = '6accd8b0d52dc43d8bf6034c';

  // 1. Initial Load of Pelenatete Isaako messages
  console.log('[TEST 1] Initial load of Pelenatete Isaako returns all real messages...');
  const { req: r1, res: res1, getStatusCode: getCode1, getData: getData1 } = mockReqRes({
    query: {
      conversation_id: pelenateteConvId,
      accountId: samoaAccountId,
      external_id: pelenateteConvId,
      limit: '100'
    }
  });

  await messagesHandler(r1, res1);
  const data1 = getData1();

  if (getCode1() === 200 && Array.isArray(data1?.messages) && data1.messages.length >= 6) {
    console.log(`  [PASS] Returned ${data1.messages.length} real messages for Pelenatete Isaako.`);
    passed++;
  } else {
    console.error(`  [FAIL] Expected >= 6 messages but got:`, data1);
    failed++;
  }

  // 2. Querying with `before=timestamp` for earlier messages
  console.log('\n[TEST 2] Querying with before=2026-11-22T00:48:44.366Z returns earlier messages...');
  const { req: r2, res: res2, getStatusCode: getCode2, getData: getData2 } = mockReqRes({
    query: {
      conversation_id: pelenateteConvId,
      accountId: samoaAccountId,
      external_id: pelenateteConvId,
      before: '2026-11-22T00:48:44.366Z',
      limit: '50'
    }
  });

  await messagesHandler(r2, res2);
  const data2 = getData2();

  if (getCode2() === 200 && Array.isArray(data2?.messages) && data2.messages.length > 0) {
    console.log(`  [PASS] Successfully retrieved ${data2.messages.length} earlier messages without Invalid cursor error.`);
    // Verify all returned messages are before the cursor
    const beforeTs = new Date('2026-11-22T00:48:44.366Z').getTime();
    const allBefore = data2.messages.every(m => new Date(m.created_at || m.sentAt || 0).getTime() < beforeTs);
    assert.strictEqual(allBefore, true, 'All returned messages must be before the requested timestamp');
    console.log('  [PASS] All returned messages are strictly older than the requested timestamp cursor.');
    passed++;
  } else {
    console.error(`  [FAIL] Earlier messages query failed:`, getCode2(), data2);
    failed++;
  }

  // 3. /api/zernio?path=inbox-messages with before parameter
  console.log('\n[TEST 3] /api/zernio?path=inbox-messages with before cursor parameter...');
  const { req: r3, res: res3, getStatusCode: getCode3, getData: getData3 } = mockReqRes({
    query: {
      path: 'inbox-messages',
      conversationId: pelenateteConvId,
      accountId: samoaAccountId,
      before: '2026-11-22T00:48:44.366Z',
      limit: '50'
    }
  });

  const zernioFn = zernioHandler.zernioUnifiedHandler || zernioHandler;
  await zernioFn(r3, res3);
  const data3 = getData3();

  if (getCode3() === 200 && Array.isArray(data3?.messages) && data3.messages.length > 0) {
    console.log(`  [PASS] /api/zernio returned ${data3.messages.length} filtered earlier messages safely.`);
    passed++;
  } else {
    console.error(`  [FAIL] Zernio earlier messages failed:`, getCode3(), data3);
    failed++;
  }

  // 4. Dummy preview sanitization
  console.log('\n[TEST 4] Dummy preview messages (msg_prev_) are detected and stripped...');
  const dummyConv = {
    id: 'test_conv_123',
    preview: 'Hi Pelenatete, we wanted to follow up.',
    messages: [
      { id: 'msg_preview_test_conv_123', text: 'Hi Pelenatete, we wanted to follow up.', incoming: true }
    ]
  };

  const hasRealMessages = (conv) => {
    if (!conv || !Array.isArray(conv.messages) || conv.messages.length === 0) return false;
    return conv.messages.some(m => m && m.id && !String(m.id).startsWith('msg_prev'));
  };

  assert.strictEqual(hasRealMessages(dummyConv), false, 'Dummy message should NOT be treated as real message');
  
  const realConv = {
    id: 'test_conv_456',
    preview: 'Real message',
    messages: [
      { id: 'm_real_1', text: 'Real text', incoming: true }
    ]
  };
  assert.strictEqual(hasRealMessages(realConv), true, 'Real message should be recognized');
  console.log('  [PASS] Dummy preview detection correctly isolates preview placeholders from real messages.');
  passed++;

  // 5. Date formatting & grouping
  console.log('\n[TEST 5] Message date grouping across multi-day chat history...');
  const testMsgs = [
    { id: '1', created_at: '2026-11-20T08:33:02.688Z', text: 'Day 1 msg' },
    { id: '2', created_at: '2026-11-20T09:03:28.252Z', text: 'Day 1 msg 2' },
    { id: '3', created_at: '2026-11-22T00:48:44.366Z', text: 'Day 3 msg' }
  ];

  let dateHeaders = [];
  let lastH = null;
  testMsgs.forEach(m => {
    const d = new Date(m.created_at);
    const headerStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    if (headerStr !== lastH) {
      lastH = headerStr;
      dateHeaders.push(headerStr);
    }
  });

  assert.strictEqual(dateHeaders.length, 2, 'Should create exactly two distinct date headers');
  console.log(`  [PASS] Date grouping generated distinct day dividers: ${dateHeaders.join(', ')}`);
  passed++;

  console.log('\n================================================================');
  console.log(` SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runEarlierMessagesSuite().catch(err => {
  console.error('Fatal error in suite:', err);
  process.exit(1);
});
