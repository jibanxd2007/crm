/**
 * Navigation & Employee Page Assignment Consistency Suite
 * 
 * Tests the targeted fixes:
 * 1. Rapid route transitions (Marketing -> Team -> Reports -> Team -> Email -> Team)
 * 2. Out-of-order async response rejection via _currentNavId tokens
 * 3. 0ms immediate shell rendering for Team view
 * 4. Dialog route isolation (modal automatically closed on route change)
 * 5. Safe route-aware assignment updates
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log(' NAVIGATION & PAGE ASSIGNMENT CONSISTENCY SUITE');
console.log('================================================================\n');

// Mock DOM Environment
function createMockDOM() {
  const elements = {};
  function makeEl(id) {
    const el = {
      id,
      innerHTML: '',
      textContent: '',
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); },
        toggle(c, force) {
          if (force === undefined) {
            if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c);
          } else if (force) {
            this.classes.add(c);
          } else {
            this.classes.delete(c);
          }
        }
      },
      style: {},
      addEventListener() {},
      removeEventListener() {},
      setAttribute() {},
      getAttribute() { return null; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      scrollTop: 0
    };
    elements[id] = el;
    return el;
  }

  global.fetch = async (url) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, staff: [], messages: [], accounts: [] }),
      text: async () => ''
    };
  };

  global.document = {
    getElementById(id) {
      if (!elements[id]) elements[id] = makeEl(id);
      return elements[id];
    },
    querySelectorAll(selector) {
      return [];
    },
    querySelector(selector) {
      return null;
    },
    createElement(tag) {
      return makeEl('tag_' + Math.random().toString(36).substring(2));
    },
    addEventListener() {},
    removeEventListener() {},
    body: makeEl('body')
  };

  global.window = {
    location: { hash: '', origin: 'http://localhost:3000', pathname: '/' },
    addEventListener() {},
    removeEventListener() {},
    _CRM_DEBUG_NAV: false
  };

  global.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
  };

  global.escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  global.AbortController = class MockAbortController {
    constructor() {
      this.signal = { aborted: false, addEventListener() {}, removeEventListener() {} };
    }
    abort() {
      this.signal.aborted = true;
    }
  };

  return { elements, window: global.window, document: global.document };
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(desc, fn) {
    try {
      fn();
      console.log(`  [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${desc}`);
      console.error(`         ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(desc, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${desc}`);
      console.error(`         ${err.message}`);
      failed++;
    }
  }

  const { elements } = createMockDOM();

  // Load app.js and dealership-views.js
  const appCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const dsViewsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'dealership-views.js'), 'utf8');

  // Run classes in this context
  vm.runInThisContext(appCode);
  vm.runInThisContext(dsViewsCode);

  // Initialize MetaCRMApp
  const app = new MetaCRMApp();
  window.app = app;

  // Mock CRM Service with test staff and pages
  app.user = { id: 'admin_test', email: 'admina@novaautos.co.nz', role: 'admin' };
  app.svc = {
    staff: [
      { id: 'usr_joy', name: 'Joy Admin', email: 'admina@novaautos.co.nz', role: 'admin', assignedPageIds: ['*'] },
      { id: 'usr_staff_1', name: 'Sales Rep 1', email: 'rep1@novaautos.co.nz', role: 'staff', assignedPageIds: ['1330954980099743'] }
    ],
    pages: [
      { id: '1330954980099743', page_id: '1330954980099743', name: 'Nova Autos Auckland', platform: 'facebook' },
      { id: '1342542735606057', page_id: '1342542735606057', name: 'Nova Autos Direct', platform: 'facebook' }
    ],
    leads: [],
    conversations: [],
    tasks: [],
    emailAccounts: [],
    emailMessages: [],
    getSessionToken() { return 'mock_token'; },
    saveAll() {},
    _saveToStorage() {}
  };

  // Test 1: Navigation ID Lifecycle & Generation Token
  test('1. Every route transition generates a strictly incremented unique _currentNavId', () => {
    const nav1 = app._currentNavId;
    window.location.hash = '#meta-ads';
    app._route();
    const nav2 = app._currentNavId;
    assert.strictEqual(nav2, nav1 + 1, 'navId must increment on each route change');
    assert.strictEqual(app.currentRoute, 'meta-ads', 'active route must be meta-ads');

    window.location.hash = '#staff';
    app._route();
    const nav3 = app._currentNavId;
    assert.strictEqual(nav3, nav2 + 1, 'navId must increment on next route change');
    assert.strictEqual(app.currentRoute, 'staff', 'active route must be staff');
  });

  // Test 2: Immediate Synchronous Shell Rendering for Team (#staff)
  test('2. Team navigation (#staff) renders the staff management shell at 0ms without leaving previous screen', () => {
    // Start on marketing
    window.location.hash = '#meta-ads';
    app._route();
    assert.strictEqual(app.currentRoute, 'meta-ads');

    // Rapid switch to staff
    window.location.hash = '#staff';
    app._route();

    // Verify synchronous DOM updates at 0ms
    assert.strictEqual(app.el.title.textContent, 'User Accounts & Access Management', 'Header title must update synchronously');
    assert.ok(app.el.content.innerHTML.includes('Production User Access Directory'), 'Content must render staff table immediately');
    assert.ok(app.el.content.innerHTML.includes('Sales Rep 1'), 'Cached staff must appear immediately');
    assert.ok(!app.el.content.innerHTML.includes('Marketing & Meta'), 'Previous route content must never remain visible');
  });

  // Test 3: Out-of-order Async Response Rejection
  await asyncTest('3. Out-of-order network responses from previous screens are safely dropped', async () => {
    // 1. User navigates to Reports
    window.location.hash = '#reports';
    app._route();
    const reportsNavId = app._currentNavId;
    assert.strictEqual(app.currentRoute, 'reports');

    // Simulate delayed response payload from /api/reports
    const mockReportData = {
      summary: { totalEnquiries: 42, contacted: 30, booked: 10, dealsWon: 5 },
      pageBreakdown: [],
      staffBreakdown: []
    };

    // 2. User rapidly switches to Team (#staff) before Reports response arrives
    window.location.hash = '#staff';
    app._route();
    const staffNavId = app._currentNavId;
    assert.strictEqual(app.currentRoute, 'staff');
    assert.notStrictEqual(staffNavId, reportsNavId);

    // 3. Stale Reports async callback finishes now
    // If the fix works, isNavCurrent('reports', reportsNavId) returns false and drops the render
    const isReportsStillCurrent = app.isNavCurrent('reports', reportsNavId);
    assert.strictEqual(isReportsStillCurrent, false, 'Stale reports navId must be recognized as not current');

    // Attempt to invoke renderReports with the stale navId
    app.renderReports(reportsNavId);

    // 4. Verify DOM is NOT corrupted with Reports content
    assert.strictEqual(app.currentRoute, 'staff', 'Route must remain staff');
    assert.strictEqual(app.el.title.textContent, 'User Accounts & Access Management', 'Title must remain Team management');
    assert.ok(app.el.content.innerHTML.includes('Production User Access Directory'), 'Content must still show staff table');
    assert.ok(!app.el.content.innerHTML.includes('Business Reports'), 'Stale report render must be dropped completely');
  });

  // Test 4: Modal Route Isolation
  test('4. Open modals are automatically closed on route transitions', () => {
    // 1. Go to Team
    window.location.hash = '#staff';
    app._route();

    // 2. Open Page Assignment Modal for Sales Rep 1
    app.openAssignPagesModal('usr_staff_1');
    assert.ok(app.el.mOverlay.classList.contains('open'), 'Modal must be open');
    assert.ok(app.el.mTitle.textContent.includes('Assign Dealership Pages'), 'Modal title must be page assignment');

    // 3. User navigates to Reports (#reports)
    window.location.hash = '#reports';
    app._route();

    // 4. Modal MUST be closed now
    assert.ok(!app.el.mOverlay.classList.contains('open'), 'Modal must be closed when navigating away');
    assert.strictEqual(app._activeAssignModalStaffId, null, 'Active modal tracking must be cleared');
  });

  // Test 5: Modal Open Guard on Non-staff Routes
  test('5. openAssignPagesModal is rejected when current route is not staff', () => {
    window.location.hash = '#reports';
    app._route();
    assert.strictEqual(app.currentRoute, 'reports');

    // Attempt to open assign pages modal while on reports
    app.openAssignPagesModal('usr_staff_1');
    assert.ok(!app.el.mOverlay.classList.contains('open'), 'Modal must NOT open while on Reports route');
  });

  // Test 6: Rapid Navigation Sequence from Recording
  test('6. Rapid navigation sequence (Marketing -> Team -> Reports -> Team -> Email -> Team) maintains complete consistency', () => {
    const sequence = ['meta-ads', 'staff', 'reports', 'staff', 'email', 'staff'];
    const titles = {
      'meta-ads': 'Marketing / Meta', // or Marketing & Meta
      'staff': 'User Accounts & Access Management',
      'reports': 'Business Reports',
      'email': 'Email Inbox'
    };

    for (const target of sequence) {
      window.location.hash = '#' + target;
      app._route();
      assert.strictEqual(app.currentRoute, target, `Active route must match ${target}`);
      if (target === 'staff') {
        assert.strictEqual(app.el.title.textContent, 'User Accounts & Access Management');
        assert.ok(app.el.content.innerHTML.includes('Production User Access Directory'), 'Content must match Team shell');
      }
    }
  });

  console.log(`\n================================================================`);
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`================================================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test suite failed unexpectedly:', err);
  process.exit(1);
});
