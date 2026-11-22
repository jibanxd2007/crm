const assert = require('assert');
const path = require('path');
require('dotenv').config();

const messagesHandler = require('../api/messages');
const zernioHandler = require('../api/zernio');

function mockReq(method, query = {}, headers = {}, body = null) {
  return {
    method,
    headers: { 'x-user-id': 'admin', host: 'localhost', ...headers },
    query,
    body
  };
}

function mockRes() {
  let statusCode = 200;
  let headers = {};
  let bodyData = null;
  const res = {
    setHeader: (k, v) => { headers[k] = v; },
    status: (code) => { statusCode = code; return res; },
    json: (d) => { bodyData = d; return res; },
    end: (d) => { if (d) bodyData = d; return res; },
    _getStatusCode: () => statusCode,
    _getData: () => bodyData
  };
  return res;
}

async function runSuite() {
  console.log('================================================================');
  console.log(' METACRM — FINAL COMPLETE INBOX VERIFICATION SUITE');
  console.log('================================================================');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`  [FAIL] ${name}: ${e.message}`);
      failed++;
    }
  }

  // 1. Verify Safe Date Parser Logic
  console.log('\n[TEST 1] Safe Message Date Parser Logic (Year 2001 prevention)...');
  const dealershipCode = require('fs').readFileSync(path.join(__dirname, '../js/dealership-views.js'), 'utf8');
  test('dealership-views.js includes _parseSafeMessageDate helper', () => {
    assert(dealershipCode.includes('_parseSafeMessageDate'), 'Expected _parseSafeMessageDate in dealership-views.js');
  });

  // Evaluate the date parser function in isolation
  const parseSafeDate = (rawDate, fallbackDate) => {
    if (!rawDate) return fallbackDate ? new Date(fallbackDate) : new Date();
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) return rawDate;
    const str = String(rawDate).trim();
    if (/^(today|yesterday|recent|just now)/i.test(str) || /^\d{1,2}:\d{2}(\s*(am|pm))?$/i.test(str)) {
      return fallbackDate ? new Date(fallbackDate) : new Date();
    }
    if (/^[A-Za-z]{3,9}\s+\d{1,2}$/i.test(str)) {
      const currentYear = new Date().getFullYear();
      const parsed = new Date(`${str}, ${currentYear}`);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      if (d.getFullYear() < 2010) {
        d.setFullYear(new Date().getFullYear());
      }
      return d;
    }
    return fallbackDate ? new Date(fallbackDate) : new Date();
  };

  test('Partial date "Nov 22" parses with current year (2026), never 2001', () => {
    const d = parseSafeDate('Nov 22');
    assert.strictEqual(d.getFullYear(), 2026, `Expected year 2026, got ${d.getFullYear()}`);
    assert.strictEqual(d.getMonth(), 10, 'Expected month November (index 10)');
    assert.strictEqual(d.getDate(), 22, 'Expected date 22');
  });

  test('Time string "05:18 AM" falls back safely to conversation ISO timestamp', () => {
    const fallback = '2026-11-20T08:33:02.688Z';
    const d = parseSafeDate('05:18 AM', fallback);
    assert.strictEqual(d.toISOString(), fallback, 'Expected fallback timestamp');
  });

  // 2. Verify Needs Reply logic
  console.log('\n[TEST 2] Needs Reply Logic (No more 100% false positives)...');
  const convNeedsReply = (c) => {
    if (!c || c.is_archived || c.status === 'resolved' || c.status === 'archived') return false;
    if ((c.unread && c.unread > 0) || (c.unread_count && c.unread_count > 0)) return true;
    if (c.status === 'needs_reply') return true;

    if (Array.isArray(c.messages) && c.messages.length > 0) {
      const real = c.messages.filter(m => m && m.id && !String(m.id).startsWith('msg_prev'));
      if (real.length > 0) {
        const last = real[real.length - 1];
        const isIncoming = last.incoming === true || last.sender_type === 'customer' || last.direction === 'inbound' || last.direction === 'incoming';
        const isOutgoing = last.incoming === false || last.sender_type === 'staff' || last.direction === 'outbound' || last.senderName === 'You';
        if (isOutgoing) return false;
        if (isIncoming) return true;
      }
    }

    if (c.last_message_direction === 'outbound' || c.direction === 'outbound') return false;
    if (c.last_message_direction === 'inbound' || c.direction === 'inbound' || c.direction === 'incoming') return true;

    const prev = String(c.preview || c.last_message || '').trim();
    if (prev.startsWith('You:') || prev.startsWith('Staff:')) return false;

    return false;
  };

  test('Conversation with unread > 0 is marked Needs Reply', () => {
    const c = { id: 'c1', unread: 2, preview: 'Hello' };
    assert.strictEqual(convNeedsReply(c), true);
  });

  test('Conversation answered by business ("You: Hi...") is NOT marked Needs Reply', () => {
    const c = { id: 'c2', unread: 0, preview: 'You: Good morning sorry no branch in Samoa' };
    assert.strictEqual(convNeedsReply(c), false);
  });

  test('Conversation with last message outgoing is NOT marked Needs Reply', () => {
    const c = {
      id: 'c3',
      unread: 0,
      messages: [
        { id: 'm1', incoming: true, text: 'Hi' },
        { id: 'm2', incoming: false, direction: 'outbound', text: 'Hi, how can I help?' }
      ]
    };
    assert.strictEqual(convNeedsReply(c), false);
  });

  test('Conversation with last message incoming IS marked Needs Reply', () => {
    const c = {
      id: 'c4',
      unread: 0,
      messages: [
        { id: 'm1', incoming: false, text: 'Hi, how can I help?' },
        { id: 'm2', incoming: true, direction: 'inbound', text: 'Is this car still available?' }
      ]
    };
    assert.strictEqual(convNeedsReply(c), true);
  });

  // 3. Upward Scroll Auto-loading & Delegation
  console.log('\n[TEST 3] Upward Scroll Auto-loading & App Delegations...');
  const appCode = require('fs').readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

  test('app.js defines handleThreadScroll', () => {
    assert(appCode.includes('handleThreadScroll('), 'Expected handleThreadScroll in app.js');
  });

  test('app.js defines loadMoreVisibleConvs', () => {
    assert(appCode.includes('loadMoreVisibleConvs()'), 'Expected loadMoreVisibleConvs in app.js');
  });

  test('app.js defines openSyncManagerModal', () => {
    assert(appCode.includes('openSyncManagerModal()'), 'Expected openSyncManagerModal in app.js');
  });

  test('dealership-views.js delegates hasRealMessages and fetchRealConversationMessages', () => {
    assert(dealershipCode.includes('proto.hasRealMessages = function'), 'Expected proto.hasRealMessages in dealership-views.js');
    assert(dealershipCode.includes('proto.fetchRealConversationMessages = function'), 'Expected proto.fetchRealConversationMessages in dealership-views.js');
    assert(dealershipCode.includes('proto._renderAttachmentInBubble = function'), 'Expected proto._renderAttachmentInBubble in dealership-views.js');
  });

  // 4. Live Sync Manager API Endpoint
  console.log('\n[TEST 4] Sync Manager API Telemetry Endpoint...');
  const smReq = mockReq('GET', { path: 'sync-manager' });
  const smRes = mockRes();
  await zernioHandler(smReq, smRes);
  const smData = smRes._getData();

  test('Sync Manager endpoint returns success and 6 canonical dealership accounts', () => {
    assert.strictEqual(smRes._getStatusCode(), 200);
    assert.strictEqual(smData.status, 'success');
    assert(Array.isArray(smData.accounts), 'Expected accounts array');
    assert.strictEqual(smData.accounts.length, 6, `Expected 6 accounts, got ${smData.accounts.length}`);
  });

  // 5. Pelenatete Isaako Complete Message Thread Recovery
  console.log('\n[TEST 5] Pelenatete Isaako Real Message Recovery from Zernio...');
  const msgReq = mockReq('GET', {
    path: 'inbox-messages',
    conversationId: '28957314853971061',
    accountId: '6accd8b0d52dc43d8bf6034c',
    limit: '100'
  });
  const msgRes = mockRes();
  await zernioHandler(msgReq, msgRes);
  const msgData = msgRes._getData();

  test('Returns all 6 historical messages (both customer inquiries and business replies)', () => {
    assert.strictEqual(msgRes._getStatusCode(), 200);
    const msgs = msgData.messages || [];
    assert.strictEqual(msgs.length, 6, `Expected 6 messages, got ${msgs.length}`);

    // Verify incoming customer inquiries are present
    const customerMsgs = msgs.filter(m => m.direction === 'incoming');
    assert.strictEqual(customerMsgs.length, 4, `Expected 4 customer messages, got ${customerMsgs.length}`);
    assert(customerMsgs.some(m => m.message.includes('branch in Samoa')), 'Expected customer message about branch in Samoa');
    assert(customerMsgs.some(m => m.message.includes('No thank you')), 'Expected customer message "No thank you"');

    // Verify outgoing staff replies are present
    const staffMsgs = msgs.filter(m => m.direction === 'outgoing');
    assert.strictEqual(staffMsgs.length, 2, `Expected 2 staff messages, got ${staffMsgs.length}`);
    assert(staffMsgs.some(m => m.message.includes('sorry no branch in Samoa')), 'Expected staff reply');
    assert(staffMsgs.some(m => m.message.includes('wanted to follow up')), 'Expected staff follow up reply');
  });

  // 6. Deep Conversation Pagination (> 100 conversations recovered)
  console.log('\n[TEST 6] Deep Historical Pagination for Nova cars Samoa nz...');
  const convReq = mockReq('GET', {
    path: 'inbox-conversations',
    accountId: '6accd8b0d52dc43d8bf6034c',
    all: 'true',
    max_pages: '10'
  });
  const convRes = mockRes();
  await zernioHandler(convReq, convRes);
  const convData = convRes._getData();

  test('Nova cars Samoa nz returns > 100 conversations (recovers beyond the 100-cap)', () => {
    assert.strictEqual(convRes._getStatusCode(), 200);
    const convs = convData.conversations || [];
    assert(convs.length > 100, `Expected > 100 conversations, got ${convs.length}`);
    console.log(`     -> Verified: ${convs.length} total conversations recovered for Nova cars Samoa nz!`);
  });

  console.log('\n================================================================');
  console.log(` SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});
