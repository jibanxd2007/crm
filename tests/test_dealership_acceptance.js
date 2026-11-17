/**
 * Dealership CRM Comprehensive Acceptance Test Suite (Section 9)
 * Verifies RBAC, Multi-Page Inbox Safety, Lead Ads Ingestion & Replay Idempotency,
 * Concurrent Atomic Assignment, Integration Health, Outbound Message Retry Idempotency,
 * Pacific/Auckland DST Reports Reconciliation, and Human vs Automated Response Metrics.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Load local .env safely without leaking secrets
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split('\n').forEach(line => {
    const t = line.trim();
    if (t && !t.startsWith('#') && t.includes('=')) {
      const i = t.indexOf('=');
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  });
}
loadEnv(path.join(__dirname, '..', '.env'));

const leadsApi = require('../api/leads.js');
const messagesApi = require('../api/messages.js');
const reportsApi = require('../api/reports.js');
const zernioApi = require('../api/zernio.js');
const leadIngestion = require('../api/_utils/lead-ingestion.js');
const CRMService = require('../js/crm-service.js');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  [FAIL] ${name}\n         ${err.message}`);
  }
}

function mockRes() {
  const r = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(d) { this.body = d; return this; },
    send(d) { this.body = d; return this; },
    end() { return this; }
  };
  return r;
}

async function run() {
  console.log('\n====================================================================');
  console.log(' NOVA AUTOS NZ DEALERSHIP CRM — ACCEPTANCE VERIFICATION SUITE');
  console.log('====================================================================\n');

  // 1. RBAC & Page Isolation across Leads, Messages, and Reports APIs
  await test('1a. Staff (user_a) cannot GET/POST/PATCH leads for unassigned page_02 (HTTP 403)', async () => {
    const resGet = mockRes();
    await leadsApi({ method: 'GET', headers: { 'x-user-id': 'user_a' }, query: { page_id: 'page_02' }, url: '/api/leads?page_id=page_02' }, resGet);
    assert.strictEqual(resGet.statusCode, 403, `Expected 403 on GET, got ${resGet.statusCode}`);

    const resPost = mockRes();
    await leadsApi({ method: 'POST', headers: { 'x-user-id': 'user_a' }, query: {}, body: { name: 'Blocked Lead', page_id: 'page_02' }, url: '/api/leads' }, resPost);
    assert.strictEqual(resPost.statusCode, 403, `Expected 403 on POST, got ${resPost.statusCode}`);

    const resPatch = mockRes();
    await leadsApi({ method: 'PATCH', headers: { 'x-user-id': 'user_a' }, query: {}, body: { id: 'lead_123', page_id: 'page_02', status: 'Won' }, url: '/api/leads' }, resPatch);
    assert.strictEqual(resPatch.statusCode, 403, `Expected 403 on PATCH, got ${resPatch.statusCode}`);
  });

  await test('1b. Staff (user_a) cannot GET/PATCH messages or GET reports for unassigned page_02 (HTTP 403)', async () => {
    const resMsgGet = mockRes();
    await messagesApi({ method: 'GET', headers: { 'x-user-id': 'user_a' }, query: { page_id: 'page_02' }, url: '/api/messages?page_id=page_02' }, resMsgGet);
    assert.strictEqual(resMsgGet.statusCode, 403, `Expected 403 on GET messages, got ${resMsgGet.statusCode}`);

    const resMsgPatch = mockRes();
    await messagesApi({ method: 'PATCH', headers: { 'x-user-id': 'user_a' }, query: {}, body: { conversation_id: 'conv_b1', page_id: 'page_02', unread_count: 0 }, url: '/api/messages' }, resMsgPatch);
    assert.strictEqual(resMsgPatch.statusCode, 403, `Expected 403 on PATCH messages, got ${resMsgPatch.statusCode}`);

    const resRep = mockRes();
    await reportsApi({ method: 'GET', headers: { 'x-user-id': 'user_a' }, query: { page_id: 'page_02' }, url: '/api/reports?page_id=page_02' }, resRep);
    assert.strictEqual(resRep.statusCode, 403, `Expected 403 on GET reports, got ${resRep.statusCode}`);
  });

  // 2. Multi-Page Inbox Architecture, Sender Lock, Drafts & Native NZD Currency
  await test('2a. Inbox uses stable Page Rail, "Replying as" sender banner, work queues, and preserves open drafts', async () => {
    const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');

    assert.ok(appSrc.includes('class="inbox-page-rail"'), 'Missing stable inbox-page-rail');
    assert.ok(appSrc.includes('Replying as:'), 'Missing explicit "Replying as" composer sender banner');
    assert.ok(appSrc.includes('_getConvDraft(') && appSrc.includes('_setConvDraft('), 'Missing per-conversation draft persistence');
    assert.ok(appSrc.includes('Needs Reply') && appSrc.includes('Follow-up Due') && appSrc.includes('Unassigned'), 'Missing required work queues');
    assert.ok(!appSrc.includes('<option value="">John Doe</option>'), 'Legacy "John Doe" unassigned bug still present');
    assert.ok(!appSrc.includes('Enterprise Lead Gen'), 'Fabricated demo attribution string still present');
    assert.ok(cssSrc.includes('@media (max-width: 1280px)') && cssSrc.includes('@media (max-width: 768px)'), 'Missing adaptive responsive breakpoints');
  });

  await test('2b. CRMService stores & formats NZD natively without 50x INR distortion', async () => {
    global.window = { addEventListener() {}, dispatchEvent() {} };
    global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
    const svc = new CRMService();
    assert.strictEqual(svc.getCurrency(), 'NZD');
    assert.strictEqual(svc.convertAmount(15000), 15000, 'NZD amount must not be divided/multiplied by INR rate');
    const formatted = svc.formatMoney(15000);
    assert.ok(formatted.includes('15,000'), `Expected formatted NZD to include 15,000, got ${formatted}`);
  });

  // 3. Lead Ads Ingestion, Custom Field Mapping, Contact Separation & Replay Idempotency
  await test('3a. Valid Lead Ad ingests ONCE with standard + custom answers and replay deduplicates cleanly', async () => {
    const uniqueLeadId = `meta_lead_test_${Date.now()}`;
    const payload = {
      leadgen_id: uniqueLeadId,
      page_id: '1342542735606057',
      page_name: 'Nova auto nz',
      form_id: 'form_aqua_01',
      form_name: 'Toyota Aqua Finance Form',
      campaign_id: 'cmp_nz_spring_26',
      campaign_name: 'Auckland Hybrid Spring Ads',
      field_data: [
        { name: 'full_name', values: ['Wiremu Patel'] },
        { name: 'email', values: ['wiremu.patel@example.co.nz'] },
        { name: 'phone_number', values: ['021 444 8899'] },
        { name: 'preferred_vehicle', values: ['2019 Toyota Aqua Hybrid'] },
        { name: 'budget_nzd', values: ['$14,500'] },
        { name: 'payment_type', values: ['Zero Deposit Finance'] },
        { name: 'trade_in_vehicle', values: ['2011 Suzuki Swift'] },
        { name: 'buying_timeframe', values: ['This week'] }
      ]
    };

    const run1 = await leadIngestion.ingestLeadAdEvent(null, payload, {
      provider: 'test_fixture',
      eligibleStaffIds: ['staff_1', 'staff_2'],
      skipDbWrite: true
    });
    assert.strictEqual(run1.isDuplicate, false, 'First ingestion must not be marked duplicate');
    assert.strictEqual(run1.lead.full_name, 'Wiremu Patel');
    assert.strictEqual(run1.lead.vehicle_interest, '2019 Toyota Aqua Hybrid');
    assert.strictEqual(run1.lead.budget_nzd, 14500);
    assert.strictEqual(run1.lead.payment_preference, 'Finance');
    assert.strictEqual(run1.lead.trade_in_info, '2011 Suzuki Swift');
    assert.strictEqual(run1.lead.buying_timeframe, 'This week');
    assert.strictEqual(run1.lead.custom_fields.trade_in_vehicle, '2011 Suzuki Swift');
    assert.strictEqual(run1.lead.messaging_eligible, false, 'Lead Ad submission must NOT assume Messenger is open');

    // Replay exact same webhook
    const run2 = await leadIngestion.ingestLeadAdEvent(null, payload, {
      provider: 'test_fixture',
      eligibleStaffIds: ['staff_1', 'staff_2'],
      skipDbWrite: true
    });
    assert.strictEqual(run2.isDuplicate, true, 'Replayed Lead Ad webhook MUST be deduplicated');
  });

  await test('3b. Contact vs Enquiry separation: repeat enquiries keep distinct leads, no name-only merge, strict page isolation', async () => {
    const c1 = await leadIngestion.findOrCreatePageScopedContact(null, { pageId: 'page_A', fullName: 'Sam Jones', email: 'sam.j@example.co.nz', phone: '021 111 2222' });
    const c2 = await leadIngestion.findOrCreatePageScopedContact(null, { pageId: 'page_A', fullName: 'Sam Jones', email: 'sam.j@example.co.nz', phone: '+64211112222' });
    assert.strictEqual(c1.contactId, c2.contactId, 'Same normalized NZ phone on same page must link to same contact');

    // Same name, different identifiers -> MUST NOT merge
    const c3 = await leadIngestion.findOrCreatePageScopedContact(null, { pageId: 'page_A', fullName: 'Sam Jones', email: 'other.sam@example.co.nz', phone: '021 999 0000' });
    assert.notStrictEqual(c1.contactId, c3.contactId, 'Must NEVER merge contacts solely because names match');

    // Same phone on Page B -> MUST be isolated from Page A
    const cPageB = await leadIngestion.findOrCreatePageScopedContact(null, { pageId: 'page_B', fullName: 'Sam Jones', email: 'sam.j@example.co.nz', phone: '021 111 2222' });
    assert.notStrictEqual(c1.contactId, cPageB.contactId, 'Must NEVER share contact records across pages');
  });

  // 4. Concurrent Atomic Assignment Workers & Eligibility Enforcement
  await test('4a. Two concurrent assignment workers do not assign conflicting owners', async () => {
    const leadId = `lead_race_${Date.now()}`;
    const [w1, w2] = await Promise.all([
      leadIngestion.assignLeadAtomically(null, { leadId, pageId: 'page_race', eligibleStaffIds: ['rep_alpha', 'rep_beta'] }),
      leadIngestion.assignLeadAtomically(null, { leadId, pageId: 'page_race', eligibleStaffIds: ['rep_alpha', 'rep_beta'] })
    ]);
    assert.ok(w1.assignedStaffId && w2.assignedStaffId, 'Both workers must resolve a valid owner');
    assert.strictEqual(w1.assignedStaffId, w2.assignedStaffId, `Concurrent workers assigned conflicting owners: ${w1.assignedStaffId} vs ${w2.assignedStaffId}`);
  });

  await test('4b. Assignment rejects ineligible staff and falls back to Unassigned (null) when page has 0 reps', async () => {
    const rejected = await leadIngestion.assignLeadAtomically(null, {
      leadId: `lead_inelig_${Date.now()}`,
      pageId: 'page_X',
      eligibleStaffIds: ['rep_x1'],
      manualStaffId: 'rep_from_other_page'
    });
    assert.strictEqual(rejected.rejected, true, 'Ineligible staff assignment must be rejected');

    const fallback = await leadIngestion.assignLeadAtomically(null, {
      leadId: `lead_empty_${Date.now()}`,
      pageId: 'page_no_staff',
      eligibleStaffIds: []
    });
    assert.strictEqual(fallback.assignedStaffId, null, 'Page with zero eligible staff must fall back to null (Unassigned)');
    assert.strictEqual(fallback.fallbackUnassigned, true);
  });

  // 5. Server-Side Developer-Only Diagnostics & Guided Test Lead Endpoint
  await test('5. Developer diagnostics & test-lead enforce server-side developer auth (403 for Staff AND Dealership Super Admin, 200 for Developer)', async () => {
    const protectedEndpoints = [
      { method: 'GET', path: 'health' },
      { method: 'GET', path: 'diagnostics' },
      { method: 'POST', path: 'test-lead' },
      { method: 'POST', path: 'recover-failed-webhooks' },
      { method: 'POST', path: 'simulate-lead' }
    ];

    for (const ep of protectedEndpoints) {
      const staffRes = mockRes();
      await zernioApi.zernioUnifiedHandler({ method: ep.method, headers: { 'x-user-id': 'user_a' }, query: { path: ep.path }, body: {}, url: `/api/zernio?path=${ep.path}` }, staffRes);
      assert.strictEqual(staffRes.statusCode, 403, `Staff must receive 403 on ${ep.path}`);

      const superAdminRes = mockRes();
      await zernioApi.zernioUnifiedHandler({ method: ep.method, headers: { 'x-user-id': 'admin' }, query: { path: ep.path }, body: {}, url: `/api/zernio?path=${ep.path}` }, superAdminRes);
      assert.strictEqual(superAdminRes.statusCode, 403, `Dealership Super Admin must receive 403 on developer-only ${ep.path}`);
    }

    const prevDevKey = process.env.DEVELOPER_ADMIN_KEY;
    process.env.DEVELOPER_ADMIN_KEY = 'dev_test_key_2026_strict';
    try {
      const wrongKeyRes = mockRes();
      await zernioApi.zernioUnifiedHandler({
        method: 'POST',
        headers: { 'x-user-id': 'admin', 'x-developer-key': 'wrong_key' },
        query: { path: 'test-lead' },
        body: {},
        url: '/api/zernio?path=test-lead'
      }, wrongKeyRes);
      assert.strictEqual(wrongKeyRes.statusCode, 403, 'Invalid X-Developer-Key must receive 403');

      const devRes = mockRes();
      await zernioApi.zernioUnifiedHandler({
        method: 'POST',
        headers: { 'x-developer-key': 'dev_test_key_2026_strict' },
        query: { path: 'test-lead' },
        body: { page_id: '1342542735606057', page_name: 'Nova auto nz', eligibleStaffIds: ['rep_nz_1'] },
        url: '/api/zernio?path=test-lead'
      }, devRes);
      assert.strictEqual(devRes.statusCode, 200, 'Authorized developer with valid X-Developer-Key must receive 200 on test-lead');
      assert.strictEqual(devRes.body.verification.createdOnce, true);
      assert.strictEqual(devRes.body.verification.replayDeduplicated, true);
      assert.strictEqual(devRes.body.verification.messagingEligible, false);
    } finally {
      if (prevDevKey === undefined) delete process.env.DEVELOPER_ADMIN_KEY;
      else process.env.DEVELOPER_ADMIN_KEY = prevDevKey;
    }
  });

  // 6. Outbound Message Retry Idempotency
  await test('6. Message retry with same client_msg_id does not duplicate an already accepted send', async () => {
    const cid = `retry_idem_${Date.now()}`;
    const reqPayload = {
      method: 'POST',
      headers: { 'x-user-id': 'admin' },
      query: {},
      url: '/api/messages',
      body: { conversation_id: 'sim_conv_1', recipient_id: 'sim_user_1', text: 'Kia ora, car is ready!', client_msg_id: cid }
    };
    const r1 = mockRes();
    await messagesApi(reqPayload, r1);
    assert.strictEqual(r1.statusCode, 200);

    const r2 = mockRes();
    await messagesApi(reqPayload, r2);
    assert.strictEqual(r2.statusCode, 200);
    assert.strictEqual(r2.body.deduplicated, true, 'Retry with same client_msg_id must return deduplicated response');
    assert.strictEqual(r2.body.messageId, r1.body.messageId, 'Retry must return identical messageId');
  });

  // 7. Pacific/Auckland DST & Reports Reconciliation
  await test('7a. Pacific/Auckland date range handles NZDT (+13:00) and NZST (+12:00) daylight saving accurately', async () => {
    const summerBounds = reportsApi.getNZDateRange('today', null, null, new Date('2026-01-15T05:00:00Z'));
    assert.strictEqual(summerBounds.timezone, 'Pacific/Auckland');
    assert.strictEqual(summerBounds.startOffset, '+13:00', `Expected +13:00 in Jan NZDT, got ${summerBounds.startOffset}`);

    const winterBounds = reportsApi.getNZDateRange('today', null, null, new Date('2026-07-15T05:00:00Z'));
    assert.strictEqual(winterBounds.startOffset, '+12:00', `Expected +12:00 in Jul NZST, got ${winterBounds.startOffset}`);
  });

  await test('7b. Report totals reconcile exactly with underlying records & never fabricate $25k sale values', async () => {
    const t0 = new Date('2026-11-10T01:00:00Z').toISOString();
    const t5m = new Date('2026-11-10T01:05:00Z').toISOString();
    const t15m = new Date('2026-11-10T01:15:00Z').toISOString();
    const t10s = new Date('2026-11-10T01:00:10Z').toISOString();

    const fixtureLeads = [
      // Lead 1: Sold with actual $14,000 NZD, 5m human response
      { id: 'l1', page_id: 'p1', contact_id: 'c1', status: 'Won', sale_value_nzd: 14000, appointment_at: t15m, appointment_status: 'attended', created_at: t0, human_first_response_at: t5m, assigned_to: 's1', campaign_id: 'camp1', campaign_name: 'Spring Hybrids' },
      // Lead 2: Repeat enquiry from SAME contact c1, Won with NO recorded value (must stay $0, NOT fake $25,000!)
      { id: 'l2', page_id: 'p1', contact_id: 'c1', status: 'Won', sale_value_nzd: null, created_at: t0, human_first_response_at: t15m, assigned_to: 's1' },
      // Lead 3: Only received automated ack (MUST be excluded from human response metrics!)
      { id: 'l3', page_id: 'p1', contact_id: 'c2', status: 'New', created_at: t0, auto_ack_sent_at: t10s, human_first_response_at: null, auto_ack_only: true, assigned_to: null },
      // Lead 4: Lost with explicit loss_reason
      { id: 'l4', page_id: 'p2', contact_id: 'c3', status: 'Lost', loss_reason: 'Price too high', created_at: t0, assigned_to: 's2' }
    ];

    const rep = reportsApi.computeDealershipReport({
      leads: fixtureLeads,
      pages: [{ id: 'p1', page_name: 'Nova auto nz' }, { id: 'p2', page_name: 'Zodiac Motor Company' }],
      staff: [{ id: 's1', name: 'Dan' }, { id: 's2', name: 'Maki' }],
      dateBounds: reportsApi.getNZDateRange('last_7d'),
      adAccountConnected: false
    });

    assert.strictEqual(rep.summary.totalEnquiries, 4, 'Must count 4 enquiries');
    assert.strictEqual(rep.summary.uniqueContacts, 3, 'Must deduplicate to 3 unique contacts');
    assert.strictEqual(rep.summary.dealsWon, 2);
    assert.strictEqual(rep.summary.totalWonValue, 14000, 'Must ONLY sum recorded NZD sale values (no fake $25k)');
    assert.strictEqual(rep.summary.unassignedLeads, 1);
    assert.strictEqual(rep.summary.humanResponsesSampleSize, 2, 'Automated ack MUST NOT enter human response sample');
    assert.strictEqual(rep.summary.medianHumanResponseMin, 10, 'Median of [5m, 15m] must be 10m');
    assert.strictEqual(rep.summary.totalSpend, null, 'Missing ad spend must be null, not fake $0');
    assert.strictEqual(rep.adDataStatus, 'not_connected');
    assert.strictEqual(rep.lostReasons['Price too high'], 1);
  });

  // 8. Automated Acknowledgements Do Not Improve Human First-Response Metrics (API)
  await test('8. POST /api/leads?path=first-response separates automated ack from human response', async () => {
    const lid = `lead_auto_ack_${Date.now()}`;
    const rAuto = mockRes();
    await leadsApi({
      method: 'POST',
      headers: { 'x-user-id': 'admin' },
      query: { path: 'first-response' },
      body: { leadId: lid, action: 'auto_template', isAutomated: true },
      url: '/api/leads?path=first-response'
    }, rAuto);
    assert.strictEqual(rAuto.statusCode, 200);
    assert.strictEqual(rAuto.body.record.humanFirstResponseAt, null, 'Automated ack must leave humanFirstResponseAt null');
    assert.ok(rAuto.body.record.autoAckSentAt, 'Automated ack must populate autoAckSentAt');

    const rHuman = mockRes();
    await leadsApi({
      method: 'POST',
      headers: { 'x-user-id': 'admin' },
      query: { path: 'first-response' },
      body: { leadId: lid, action: 'call', isAutomated: false },
      url: '/api/leads?path=first-response'
    }, rHuman);
    assert.strictEqual(rHuman.statusCode, 200);
    assert.ok(rHuman.body.record.humanFirstResponseAt, 'Human response must populate humanFirstResponseAt');
  });

  // 9. Electron Desktop Compatibility Check
  await test('9. Electron main entry and desktop bridge remain intact', async () => {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'electron', 'main.js')), 'Missing electron/main.js');
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'js', 'desktop-bridge.js')), 'Missing js/desktop-bridge.js');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('js/desktop-bridge.js'), 'index.html must still load desktop-bridge.js');
  });

  // 10. Zernio CamelCase Lead Payload Parsing, Dynamic Page Mapping & Zero Hardcoded IDs
  await test('10a. Zernio camelCase fieldData & fields object preserve all dealership answers cleanly', async () => {
    const zernioPayload = {
      leadgenId: `zn_camel_${Date.now()}`,
      formId: '2268031970709360',
      formName: 'nova auto nz',
      campaignId: '120253146345640334',
      adId: '120253168976070334',
      page_id: 'page_dynamic_99',
      createdTime: '2026-11-16T20:45:40.000Z',
      fields: {
        full_name: 'Sione Test',
        phone_number: '021 555 8899',
        email: 'sione.test@example.co.nz',
        'what_car_you_looking_for?': '7-seater SUV',
        'are_you_looking_for_a_car_on_finance?': 'yes',
        'do_you_have_a_driving_license?': 'Full NZ'
      }
    };
    const res = await leadIngestion.ingestLeadAdEvent(null, zernioPayload, { provider: 'zernio', eligibleStaffIds: ['rep_dyn_1'] });
    assert.strictEqual(res.isDuplicate, false);
    assert.strictEqual(res.lead.vehicle_interest, '7-seater SUV');
    assert.strictEqual(res.lead.payment_preference, 'Finance');
    assert.strictEqual(res.lead.custom_fields['do_you_have_a_driving_license?'], 'Full NZ');
    assert.strictEqual(res.lead.campaign_id, '120253146345640334');
    assert.strictEqual(res.lead.ad_id, '120253168976070334');
    assert.strictEqual(res.assignedStaffId, 'rep_dyn_1');
  });

  await test('10b. Dynamic page mapping resolves newly added pages with zero hardcoded 6-account IDs', async () => {
    const vm = require('vm');
    const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'crm-service.js'), 'utf8');
    const appCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const hardcodedRx = /6accd8b0d52dc43d8bf6034c|6acd4daed19284a3227d7870|6aea527fa5c031c687ccba15|6aea5280a5c031c687ccba16|6aea5280a5c031c687ccba17|6aea5281a5c031c687ccba18/;
    assert.ok(!hardcodedRx.test(code), 'js/crm-service.js must not hardcode Zernio account IDs');
    assert.ok(!hardcodedRx.test(appCode), 'js/app.js must not hardcode Zernio account IDs');

    const sandbox = {
      window: { location: { origin: 'http://localhost', hostname: 'localhost' }, addEventListener: () => {}, dispatchEvent: () => {} },
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      CustomEvent: class CustomEvent { constructor(t, d) { this.type = t; this.detail = d?.detail; } },
      console, Date, Math, JSON, Set, Map, Array, Object, Promise, setTimeout, clearTimeout,
      fetch: async () => ({ ok: false, json: async () => ({}) })
    };
    vm.createContext(sandbox);
    vm.runInContext(code + '\nthis.__CRMService = CRMService;', sandbox);
    const svc = new sandbox.__CRMService();
    svc.pages = [{ id: '998877665544', page_id: '998877665544', accountId: 'z_acc_brand_new', zernioAccountId: 'z_acc_brand_new', name: 'New Branch Motors NZ' }];
    assert.strictEqual(svc.resolveCanonicalPageId('z_acc_brand_new'), '998877665544');
    assert.strictEqual(svc.resolveZernioAccountId('998877665544'), 'z_acc_brand_new');
    assert.strictEqual(svc.resolvePageRecord('z_acc_brand_new').name, 'New Branch Motors NZ');
  });

  await test('10c. Pipeline exposes accessible Stage select; Marketing has only 2 client-facing tabs (Ad Leads & Campaign Results)', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const viewsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'dealership-views.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(indexHtml.includes('css/design-system.css'), 'index.html must load unified design-system.css');
    assert.ok(indexHtml.includes('js/dealership-views.js'), 'index.html must load dealership-views.js');
    assert.ok(appCode.includes('moveLeadStage('), 'Pipeline must provide moveLeadStage non-drag handler');
    assert.ok(viewsCode.includes('kanban-stage-select') && viewsCode.includes('finance_status'), 'Pipeline cards must expose non-drag Stage selector and separate finance_status');
    assert.ok(viewsCode.includes("switchAdsTab('ad_leads')") && viewsCode.includes("switchAdsTab('campaigns')"), 'Marketing / Meta must have Ad Leads and Campaign Results tabs');
    assert.ok(!viewsCode.includes("switchAdsTab('health')"), 'Connection Health tab must be removed from client-facing Marketing');
    assert.ok(!viewsCode.includes('Technical Diagnostics'), 'Technical Diagnostics must not appear in client-facing Marketing');
    assert.ok(viewsCode.includes('renderSettings') && viewsCode.includes('Add Facebook Page') && viewsCode.includes('Reconnect Facebook'), 'Settings -> Accounts must provide simple Add/Reconnect Facebook actions');
    assert.ok(viewsCode.includes('renderDeveloperDiagnostics') && viewsCode.includes('Developer Access Required'), 'Separate developer-only diagnostics view must enforce server-side access denial');
  });

  // 11. Client-Facing Business Status Endpoint Isolation & Zero Technical Leaks
  await test('11. GET /api/zernio?path=business-status is Manager-only (403 for Staff) and leaks zero technical/secret fields', async () => {
    const staffRes = mockRes();
    await zernioApi.zernioUnifiedHandler({ method: 'GET', headers: { 'x-user-id': 'user_a' }, query: { path: 'business-status' }, url: '/api/zernio?path=business-status' }, staffRes);
    assert.strictEqual(staffRes.statusCode, 403, 'Sales staff must not access business-status integration endpoint');

    const mgrRes = mockRes();
    await zernioApi.zernioUnifiedHandler({ method: 'GET', headers: { 'x-user-id': 'admin' }, query: { path: 'business-status' }, url: '/api/zernio?path=business-status' }, mgrRes);
    assert.strictEqual(mgrRes.statusCode, 200, 'Dealership manager must receive 200 on sanitized business-status');
    const serialized = JSON.stringify(mgrRes.body).toLowerCase();
    for (const forbidden of ['webhook', 'secret', 'apikey', 'api_key', 'token', 'scope', 'leadgen', 'failurecount', 'crm-beta-three-36', 'zernio']) {
      assert.ok(!serialized.includes(forbidden), `business-status must not leak technical/secret string "${forbidden}"`);
    }

    const statusRes = mockRes();
    await zernioApi.zernioUnifiedHandler({ method: 'GET', headers: { 'x-user-id': 'admin' }, query: { path: 'status' }, url: '/api/zernio?path=status' }, statusRes);
    assert.strictEqual(statusRes.body.apiKey, undefined, 'path=status must never return apiKey even masked');
  });

  console.log('\n====================================================================');
  console.log(` ACCEPTANCE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

run();
