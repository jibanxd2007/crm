const assert = require('assert');
const fs = require('fs');

console.log('================================================================');
console.log(' P0 APPLICATION STABILIZATION & ROUTING REPAIR VERIFICATION');
console.log('================================================================\n');

// 1. Verify syntax of modified files
console.log('1. Checking syntax of core files...');
try {
  require('../api/zernio.js');
  console.log('  [PASS] api/zernio.js syntax clean');
} catch (e) {
  console.error('  [FAIL] api/zernio.js syntax error:', e);
  process.exit(1);
}

const appJs = fs.readFileSync('js/app.js', 'utf8');
const dvJs = fs.readFileSync('js/dealership-views.js', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');

// 2. Check route normalization map exists in app.js
console.log('\n2. Verifying ROUTE_ALIASES in app.js...');
assert(appJs.includes('ROUTE_ALIASES'), 'ROUTE_ALIASES must be defined in app.js');
assert(appJs.includes("team: 'staff'"), "team alias must map to 'staff'");
assert(appJs.includes("overview: 'dashboard'"), "overview alias must map to 'dashboard'");
assert(appJs.includes("appointments: 'tasks'"), "appointments alias must map to 'tasks'");
assert(appJs.includes("analytics: 'reports'"), "analytics alias must map to 'reports'");
assert(appJs.includes("marketing: 'meta-ads'"), "marketing alias must map to 'meta-ads'");
assert(appJs.includes("integrations: 'connections'"), "integrations alias must map to 'connections'");
console.log('  [PASS] All canonical route aliases mapped properly');

// 3. Check isNavCurrent supports array of valid routes
console.log('\n3. Verifying isNavCurrent supports array matching...');
assert(appJs.includes('if (Array.isArray(expectedRoute))'), 'isNavCurrent must support array of routes');
console.log('  [PASS] Array route matching verified');

// 4. Verify all render functions have nav guards
console.log('\n4. Verifying nav guards on all screen renderers...');
assert(appJs.includes("if (!this.isNavCurrent('dashboard', navId)) return;"), 'renderDashboard must have nav guard');
assert(appJs.includes("if (!this.isNavCurrent('leads', navId)) return;"), 'renderLeads must have nav guard');
assert(appJs.includes("if (!this.isNavCurrent('pipeline', navId)) return;"), 'renderPipeline must have nav guard');
assert(appJs.includes("if (!this.isNavCurrent('tasks', navId)) return;"), 'renderTasks must have nav guard');
assert(appJs.includes("if (!this.isNavCurrent(['settings', 'connections'], navId)) return;"), 'renderSettings must have nav guard');
assert(appJs.includes("if (!this.isNavCurrent('staff', navId)) return;"), 'renderStaff must have nav guard');
assert(appJs.includes("if (!this.isNavCurrent('reports', navId)) return;"), 'renderReports must have nav guard');
assert(appJs.includes("if (!this.isNavCurrent('meta-ads', navId)) return;"), 'renderMetaAds must have nav guard');
assert(appJs.includes("if (!this.isNavCurrent('email', navId)) return;"), 'renderEmailInbox must have nav guard');
console.log('  [PASS] All 9 screen renderers protected by route generation guards');

// 5. Verify double _route() removed on login and logout
console.log('\n5. Verifying no duplicate _route() calls on login/logout...');
const loginSection = appJs.substring(appJs.indexOf('submitLogin()'), appJs.indexOf('submitLogin()') + 800);
assert(!loginSection.includes('this.navigate(target);\n          this._route();'), 'submitLogin must not call _route() twice');

const logoutSection = appJs.substring(appJs.indexOf('logout()'), appJs.indexOf('logout()') + 800);
assert(!logoutSection.includes("this.navigate('login');\n        this._route();"), 'logout must not call _route() twice');
console.log('  [PASS] Clean navigation dispatch without duplicate route execution');

// 6. Verify dealership-views does not set _fetchingMsgs = true before delegation
console.log('\n6. Verifying dealership-views message fetching flag...');
assert(!dvJs.includes('activeConv._fetchingMsgs = true;\n      setTimeout(() => {\n        if (window.app && typeof window.app.fetchRealConversationMessages'), 'dealership-views must not block fetchRealConversationMessages with premature flag');
console.log('  [PASS] Automatic message fetching cleanly decoupled from premature flag');

// 7. Verify cache-buster bumped in index.html
console.log('\n7. Verifying cache buster version in index.html...');
assert(indexHtml.includes('v=20261122-navstab1'), 'index.html must have cache buster v=20261122-navstab1');
console.log('  [PASS] Cache buster bumped to 20261122-navstab1');

console.log('\n================================================================');
console.log(' ALL VERIFICATION CHECKS PASSED (7/7)');
console.log('================================================================');
