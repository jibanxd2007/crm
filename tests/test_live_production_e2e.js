const https = require('https');

const BASE_URL = 'https://crm-mu-three-52.vercel.app';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = {
      ...headers
    };
    if (body) {
      reqHeaders['Content-Type'] = 'application/json';
    }

    const req = https.request(url, {
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runLiveProductionSmoke() {
  console.log('================================================================');
  console.log(' NOVA AUTOS NZ — LIVE PRODUCTION SMOKE VERIFICATION');
  console.log(' Target:', BASE_URL);
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  // 1. Admin Login
  console.log('[TEST 1] Logging in as Joy Admin (admina@novaautos.co.nz)...');
  const adminLoginRes = await request('POST', '/api/staff?action=login', {
    email: 'admina@novaautos.co.nz',
    password: 'NovaAutos#2026Admin!'
  });

  if (adminLoginRes.status === 200 && adminLoginRes.data?.token) {
    console.log('  [PASS] Admin authenticated successfully. Role:', adminLoginRes.data.user.role);
    passed++;
  } else {
    console.error('  [FAIL] Admin login failed:', adminLoginRes.status, adminLoginRes.data);
    failed++;
    process.exit(1);
  }

  const adminToken = adminLoginRes.data.token;
  const adminHeaders = {
    'Authorization': `Bearer ${adminToken}`,
    'X-User-Id': adminLoginRes.data.user.id
  };

  // 2. Assign Car4u to Dan (danielsamoa4u@yahoo.com) and Maki (lemaki4u@yahoo.com) simultaneously
  console.log('\n[TEST 2] Assigning Car4u (6aea5280a5c031c687ccba16) to Dan & Maki...');
  const car4uPageId = '6aea5280a5c031c687ccba16';

  const assignDanRes = await request('POST', '/api/staff?action=update-profile', {
    email: 'danielsamoa4u@yahoo.com',
    assignedPages: [car4uPageId]
  }, adminHeaders);

  const assignMakiRes = await request('POST', '/api/staff?action=update-profile', {
    email: 'lemaki4u@yahoo.com',
    assignedPages: [car4uPageId]
  }, adminHeaders);

  if (assignDanRes.status === 200 && assignMakiRes.status === 200) {
    console.log('  [PASS] Successfully assigned Car4u to Dan and Maki simultaneously.');
    passed++;
  } else {
    console.error('  [FAIL] Assignment failed:', assignDanRes.data, assignMakiRes.data);
    failed++;
  }

  // 3. Log in as Dan & Maki and verify assigned pages in session
  console.log('\n[TEST 3] Logging in as Dan & Maki and verifying assigned pages...');
  const danLogin = await request('POST', '/api/staff?action=login', {
    email: 'danielsamoa4u@yahoo.com',
    password: 'DanSamoa#2026!'
  });

  const makiLogin = await request('POST', '/api/staff?action=login', {
    email: 'lemaki4u@yahoo.com',
    password: 'MakiNova#2026!'
  });

  const danHasCar4u = (danLogin.data?.user?.assignedPages || []).includes(car4uPageId);
  const makiHasCar4u = (makiLogin.data?.user?.assignedPages || []).includes(car4uPageId);

  if (danLogin.status === 200 && makiLogin.status === 200 && danHasCar4u && makiHasCar4u) {
    console.log('  [PASS] Dan and Maki both have Car4u in assignedPages upon login.');
    passed++;
  } else {
    console.error('  [FAIL] Login page mismatch. Dan:', danLogin.data?.user?.assignedPages, 'Maki:', makiLogin.data?.user?.assignedPages);
    failed++;
  }

  const danToken = danLogin.data.token;
  const danHeaders = {
    'Authorization': `Bearer ${danToken}`,
    'X-User-Id': danLogin.data.user.id
  };

  const makiToken = makiLogin.data.token;
  const makiHeaders = {
    'Authorization': `Bearer ${makiToken}`,
    'X-User-Id': makiLogin.data.user.id
  };

  // 4. Simultaneous access to Car4u conversations by Dan & Maki
  console.log('\n[TEST 4] Simultaneous live access to Car4u conversations for Dan & Maki...');
  const [danConvs, makiConvs] = await Promise.all([
    request('GET', `/api/messages?accountId=${car4uPageId}&limit=10`, null, danHeaders),
    request('GET', `/api/messages?accountId=${car4uPageId}&limit=10`, null, makiHeaders)
  ]);

  if (danConvs.status === 200 && makiConvs.status === 200) {
    const dCount = (danConvs.data?.conversations || []).length;
    const mCount = (makiConvs.data?.conversations || []).length;
    console.log(`  [PASS] Both Dan and Maki received 200 OK. Conversations loaded: Dan=${dCount}, Maki=${mCount}`);
    passed++;
  } else {
    console.error('  [FAIL] Simultaneous access failed. Dan:', danConvs.status, 'Maki:', makiConvs.status);
    failed++;
  }

  // 5. Live Message Thread Retrieval for Car4u conversation
  console.log('\n[TEST 5] Live message thread retrieval for Car4u (conv 29485952177705815)...');
  const threadRes = await request('GET', `/api/messages?conversationId=29485952177705815&accountId=${car4uPageId}`, null, danHeaders);

  if (threadRes.status === 200 && (threadRes.data?.messages?.length > 0 || threadRes.data?.status === 'success')) {
    const msgCount = threadRes.data?.messages?.length || 0;
    console.log(`  [PASS] Car4u message thread loaded successfully. Messages count: ${msgCount}`);
    passed++;
  } else {
    console.error('  [FAIL] Failed to load Car4u message thread:', threadRes.status, threadRes.data);
    failed++;
  }

  // 6. Strict RBAC: Dan denied access to unassigned page (Nova cars Samoa nz)
  console.log('\n[TEST 6] Strict RBAC enforcement: Dan queries unassigned page (6accd8b0d52dc43d8bf6034c)...');
  const samoaPageId = '6accd8b0d52dc43d8bf6034c';
  const deniedRes = await request('GET', `/api/messages?accountId=${samoaPageId}`, null, danHeaders);

  if (deniedRes.status === 403) {
    console.log('  [PASS] Access correctly denied with HTTP 403 Forbidden.');
    passed++;
  } else {
    console.error('  [FAIL] Expected 403 Forbidden but received:', deniedRes.status);
    failed++;
  }

  // 7. Performance: All Inbox for Admin
  console.log('\n[TEST 7] Performance audit: Admin queries All Inbox across all 6 accounts...');
  const startPerf = Date.now();
  const allInboxRes = await request('GET', '/api/zernio?path=inbox-conversations', null, adminHeaders);
  const perfDuration = Date.now() - startPerf;

  if (allInboxRes.status === 200 && perfDuration < 4500) {
    const totalLoaded = (allInboxRes.data?.conversations || []).length;
    console.log(`  [PASS] All Inbox loaded ${totalLoaded} conversations in ${perfDuration}ms (< 4500ms budget).`);
    passed++;
  } else {
    console.error(`  [FAIL] All Inbox load failed or exceeded budget. Status: ${allInboxRes.status}, Duration: ${perfDuration}ms`);
    failed++;
  }

  console.log('\n================================================================');
  console.log(` PRODUCTION SMOKE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runLiveProductionSmoke().catch(err => {
  console.error('Fatal error in smoke test:', err);
  process.exit(1);
});
