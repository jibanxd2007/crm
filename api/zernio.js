const https = require('https');
const crypto = require('crypto');
let createClient = null;
try {
  createClient = require('@supabase/supabase-js').createClient;
} catch (e) {}
const { 
  createVercelHandler, 
  resolveUser, 
  isDeveloperRequest,
  httpsRequest, 
  toDeterministicUuid, 
  resolveExternalConversationId, 
  registerConversationIdMapping, 
  safeDbUpsert 
} = require('./_utils/index.js');
const { ingestLeadAdEvent, logWebhookEvent } = require('./_utils/lead-ingestion.js');
const {
  getDynamicZernioAccounts,
  resolveDynamicAccount,
  syncZernioAdsInsights,
  fetchZernioLeadForms,
  syncZernioLeads,
  inspectZernioHealth
} = require('./_utils/zernio-client.js');

// Structured diagnostics and observability tracker for Zernio & Meta synchronization
const SYNC_DIAGNOSTICS = {
  startTime: new Date().toISOString(),
  webhooksReceived: 0,
  webhooksProcessed: 0,
  incomingPersisted: 0,
  duplicatesIgnored: 0,
  failedProcessingAttempts: 0,
  lastCheckpoint: null,
  lastSyncTimes: {},
  rateLimitEvents: 0,
  unmappedMessages: 0,
  errors: []
};

function recordDiagnosticError(context, err) {
  SYNC_DIAGNOSTICS.failedProcessingAttempts++;
  const entry = {
    context,
    message: err?.message || String(err),
    timestamp: new Date().toISOString()
  };
  SYNC_DIAGNOSTICS.errors.unshift(entry);
  if (SYNC_DIAGNOSTICS.errors.length > 50) SYNC_DIAGNOSTICS.errors.pop();
}

const PROCESSED_WEBHOOK_MIDS = new Map();
function isDuplicateWebhook(mid) {
  if (!mid) return false;
  const now = Date.now();
  if (PROCESSED_WEBHOOK_MIDS.size > 2000) {
    for (const [k, ts] of PROCESSED_WEBHOOK_MIDS.entries()) {
      if (now - ts > 3600000) PROCESSED_WEBHOOK_MIDS.delete(k);
    }
  }
  if (PROCESSED_WEBHOOK_MIDS.has(mid)) {
    return true;
  }
  PROCESSED_WEBHOOK_MIDS.set(mid, now);
  return false;
}

async function withRetry(fn, maxRetries = 3, baseDelayMs = 200) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err.status || err.statusCode || (err.response && err.response.status);
      if (status && status >= 400 && status < 500 && status !== 429) {
        break; // Permanent failure: stop immediately without wasteful retry
      }
      if (attempt < maxRetries) {
        const delay = (baseDelayMs * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 50);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

function getRawStreamBuffer(req) {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.rawBody)) {
      return resolve(req.rawBody);
    }
    if (typeof req.rawBody === 'string') {
      return resolve(Buffer.from(req.rawBody, 'utf8'));
    }
    // If stream was already consumed (e.g. pre-parsed req.body in serverless or test harness),
    // return serialized body immediately instead of hanging waiting for 'end'
    if (req.readableEnded || req.complete || typeof req.on !== 'function') {
      if (Buffer.isBuffer(req.body)) return resolve(req.body);
      if (typeof req.body === 'string') return resolve(Buffer.from(req.body, 'utf8'));
      if (req.body && typeof req.body === 'object') return resolve(Buffer.from(JSON.stringify(req.body), 'utf8'));
      return resolve(Buffer.alloc(0));
    }

    const chunks = [];
    req.on('data', chunk => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', err => reject(err));
  });
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });
}

async function zernioUnifiedHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Zernio-Signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.url || '';
  const query = req.query || {};
  const path = (query.path || '').toLowerCase();
  const isWebhookRoute = path === 'webhook' || url.includes('/webhooks/zernio');

  // With bodyParser disabled for exact webhook HMAC verification, parse JSON body for non-webhook POST/PATCH/PUT routes
  if (!isWebhookRoute && ['POST', 'PUT', 'PATCH'].includes(String(req.method || '').toUpperCase()) && req.body === undefined) {
    try {
      const rawBuf = await getRawStreamBuffer(req);
      const rawTxt = rawBuf.toString('utf8').trim();
      req.body = rawTxt ? JSON.parse(rawTxt) : {};
    } catch (e) {
      req.body = {};
    }
  }

  // 0. DEVELOPER-ONLY DIAGNOSTICS & SYNC STATUS (Super Admin & Staff receive HTTP 403)
  if (path === 'diagnostics' || url.includes('/diagnostics')) {
    res.setHeader('Content-Type', 'application/json');
    if (!isDeveloperRequest(req.headers)) {
      return res.status(403).json({ error: "Forbidden: Developer authorization required." });
    }
    return res.status(200).json({
      status: "success",
      service: "zernio-sync-gateway",
      uptime: process.uptime(),
      diagnostics: {
        ...SYNC_DIAGNOSTICS,
        hasApiKey: !!process.env.ZERNIO_API_KEY,
        hasProfileId: !!process.env.ZERNIO_PROFILE_ID,
        hasSupabase: !!getSupabaseAdmin(),
        timestamp: new Date().toISOString()
      }
    });
  }

  // 0.15 CLIENT-FACING SANITIZED BUSINESS STATUS (Dealership Manager/Owner ONLY — Zero Technical Details)
  if (path === 'business-status' || url.includes('/business-status')) {
    res.setHeader('Content-Type', 'application/json');
    const user = resolveUser(req.headers);
    const isDev = isDeveloperRequest(req.headers, user);
    if (!isDev && (!user || (user.role !== 'admin' && user.role !== 'super_admin'))) {
      return res.status(403).json({ error: "Forbidden: Manager access required." });
    }
    const apiKey = process.env.ZERNIO_API_KEY;
    const supabase = getSupabaseAdmin();
    const currentHost = req.headers['x-forwarded-host'] || req.headers.host || process.env.VERCEL_URL || 'crm-mu-three-52.vercel.app';
    const rawHealth = await inspectZernioHealth({ apiKey, supabase, currentHost });

    const safePages = (rawHealth.pages || []).map(p => ({
      pageId: p.pageId,
      pageName: p.pageName,
      platform: p.platform || 'facebook',
      status: p.accountConnected ? 'connected' : 'reconnect_required',
      needsReconnect: !p.accountConnected
    }));
    const pagesNeedingReconnect = safePages.filter(p => p.needsReconnect);
    const needsReconnect = pagesNeedingReconnect.length > 0;
    const enquiriesDelayed = Boolean(!rawHealth.webhookHealth?.active);

    let notice = null;
    if (needsReconnect) {
      notice = 'Facebook needs reconnecting to receive new enquiries.';
    } else if (enquiriesDelayed) {
      notice = 'New enquiries are delayed. Your existing leads are still available.';
    }

    return res.status(200).json({
      status: 'ok',
      connectedPagesCount: safePages.filter(p => !p.needsReconnect).length,
      totalPagesCount: safePages.length,
      enquiriesDelayed,
      needsReconnect,
      pages: safePages,
      adsLastUpdatedAt: rawHealth.adsSyncState?.lastSuccessfulSync || null,
      notice,
      timestamp: new Date().toISOString()
    });
  }

  // 0.2 DEVELOPER-ONLY INTEGRATION HEALTH MATRIX (Super Admin & Staff receive HTTP 403)
  if (path === 'health' || url.includes('/health')) {
    res.setHeader('Content-Type', 'application/json');
    if (!isDeveloperRequest(req.headers)) {
      return res.status(403).json({ error: "Forbidden: Developer authorization required." });
    }
    const apiKey = process.env.ZERNIO_API_KEY;
    const hasMetaToken = Boolean(process.env.META_ACCESS_TOKEN || process.env.META_SYSTEM_USER_ACCESS_TOKEN);
    const supabase = getSupabaseAdmin();
    const currentHost = req.headers['x-forwarded-host'] || req.headers.host || process.env.VERCEL_URL || 'crm-mu-three-52.vercel.app';

    const health = await inspectZernioHealth({ apiKey, supabase, currentHost });

    let recentEvents = (global.CRM_WEBHOOK_LOG || []).slice(0, 10);
    if (supabase) {
      try {
        const { data: dbEvents } = await supabase
          .from('webhook_events')
          .select('id, provider, event_type, external_event_id, page_id, status, error_message, processed_at, created_at')
          .order('created_at', { ascending: false })
          .limit(10);
        if (Array.isArray(dbEvents) && dbEvents.length > 0) recentEvents = dbEvents;
      } catch (e) {}
    }

    return res.status(200).json({
      ...health,
      metaDirectTokenConfigured: hasMetaToken,
      ingestion: {
        webhooksReceived: SYNC_DIAGNOSTICS.webhooksReceived,
        webhooksProcessed: SYNC_DIAGNOSTICS.webhooksProcessed,
        duplicatesIgnored: SYNC_DIAGNOSTICS.duplicatesIgnored,
        failedCount: SYNC_DIAGNOSTICS.failedProcessingAttempts,
        recoveryQueueSize: (global.RECOVERABLE_FAILED_WEBHOOKS || []).length,
        lastSuccessfulEventAt: recentEvents.find(e => e.status === 'processed')?.processed_at || health.leadsSyncState?.lastLeadReceivedAt || null,
        recentEvents
      }
    });
  }

  // 0.25 META ADS INSIGHTS SYNC THROUGH ZERNIO (Admin Only, NZD-Enforced, Paginated & Deduplicated)
  if (path === 'sync-ads' || path === 'ads-insights' || url.includes('/sync-ads') || url.includes('/ads-insights')) {
    res.setHeader('Content-Type', 'application/json');
    const user = resolveUser(req.headers);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden: Admin authorization required for Meta Ads insights." });
    }
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      return res.status(200).json({ status: 'not_configured', error: 'ZERNIO_API_KEY not configured', campaigns: [], adAccounts: [] });
    }
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const range = query.range || body.range || 'last_30d';
    const since = query.since || body.since || null;
    const until = query.until || body.until || null;
    const pageId = query.pageId || query.page_id || body.pageId || body.page_id || null;
    const forceSync = path === 'sync-ads' || url.includes('/sync-ads') || query.refresh === 'true' || req.method === 'POST';

    if (!forceSync && global.ZERNIO_ADS_SYNC_CACHE?.insightsRetrievedSuccessfully && global.ZERNIO_ADS_SYNC_CACHE.lastWindow?.range === range && !pageId) {
      return res.status(200).json({
        status: 'success',
        cached: true,
        provider: 'zernio',
        currency: 'NZD',
        window: global.ZERNIO_ADS_SYNC_CACHE.lastWindow,
        lastSuccessfulSync: global.ZERNIO_ADS_SYNC_CACHE.lastSuccessfulSync,
        insightsRetrievedSuccessfully: true,
        adAccounts: global.ZERNIO_ADS_SYNC_CACHE.adAccounts,
        excludedNonNzdAccounts: global.ZERNIO_ADS_SYNC_CACHE.excludedNonNzdAccounts,
        campaigns: global.ZERNIO_ADS_SYNC_CACHE.campaigns,
        totals: global.ZERNIO_ADS_SYNC_CACHE.totals,
        providerLimitations: [
          'Zernio GET /api/v1/ads/campaigns only returns campaigns created inside Zernio; native Meta Ads Manager campaigns are retrieved via GET /api/v1/ads/insights?level=campaign.'
        ],
        timestamp: new Date().toISOString()
      });
    }

    try {
      const supabase = getSupabaseAdmin();
      const result = await syncZernioAdsInsights({ apiKey, supabase, since, until, range, pageId });
      return res.status(200).json(result);
    } catch (adsErr) {
      recordDiagnosticError('sync-ads', adsErr);
      return res.status(500).json({ status: 'error', error: adsErr.message, campaigns: [], adAccounts: [] });
    }
  }

  // 0.26 META LEAD FORMS VIA ZERNIO (Admin Only)
  if (path === 'lead-forms' || url.includes('/lead-forms')) {
    res.setHeader('Content-Type', 'application/json');
    const user = resolveUser(req.headers);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden: Admin authorization required to inspect Meta Lead Forms." });
    }
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      return res.status(200).json({ status: 'not_configured', forms: [] });
    }
    try {
      const pageId = query.pageId || query.page_id || null;
      const resForms = await fetchZernioLeadForms({ apiKey, pageId });
      return res.status(200).json({ status: 'success', ...resForms });
    } catch (fErr) {
      return res.status(500).json({ status: 'error', error: fErr.message, forms: [] });
    }
  }

  // 0.3 DEVELOPER-ONLY GUIDED TEST-LEAD WORKFLOW (Super Admin & Staff receive HTTP 403)
  if (path === 'test-lead' || url.includes('/test-lead')) {
    res.setHeader('Content-Type', 'application/json');
    if (!isDeveloperRequest(req.headers)) {
      return res.status(403).json({ error: "Forbidden: Developer authorization required to run test-lead verification." });
    }
    const body = req.body || {};
    const supabase = getSupabaseAdmin();
    const resolvedAcc = await resolveDynamicAccount(process.env.ZERNIO_API_KEY, body.page_id || body.pageId || null);
    const targetPageId = String(body.page_id || body.pageId || resolvedAcc?.pageId || 'unmapped_page');
    const targetPageName = body.page_name || body.pageName || resolvedAcc?.pageName || 'Connected Page';
    const testLeadgenId = body.meta_lead_id || `test_lead_${Date.now()}`;

    const samplePayload = {
      leadgen_id: testLeadgenId,
      page_id: targetPageId,
      page_name: targetPageName,
      platform: 'facebook',
      source: 'Facebook Lead Ad (Guided Test)',
      form_id: body.form_id || 'form_nz_finance_test',
      form_name: body.form_name || 'NZ Vehicle Finance Enquiry Form',
      campaign_id: body.campaign_id || null,
      campaign_name: body.campaign_name || null,
      created_time: Math.floor(Date.now() / 1000),
      field_data: [
        { name: 'full_name', values: [body.name || 'Aroha Tane (Test Lead)'] },
        { name: 'email', values: [body.email || `aroha.test.${Date.now()}@example.co.nz`] },
        { name: 'phone_number', values: [body.phone || '+64 21 555 0199'] },
        { name: 'preferred_vehicle', values: [body.vehicle || '2019 Toyota Aqua Hybrid'] },
        { name: 'budget_nzd', values: ['14000'] },
        { name: 'payment_type', values: ['Finance — Zero Deposit'] },
        { name: 'buying_timeframe', values: ['This weekend'] }
      ]
    };

    const firstRun = await ingestLeadAdEvent(supabase, samplePayload, {
      provider: 'guided_test',
      eligibleStaffIds: Array.isArray(body.eligibleStaffIds) ? body.eligibleStaffIds : []
    });
    // Immediately replay the identical payload to prove idempotent duplicate protection
    const replayRun = await ingestLeadAdEvent(supabase, samplePayload, {
      provider: 'guided_test',
      eligibleStaffIds: Array.isArray(body.eligibleStaffIds) ? body.eligibleStaffIds : []
    });

    return res.status(200).json({
      status: 'success',
      verification: {
        createdOnce: !firstRun.isDuplicate,
        replayDeduplicated: Boolean(replayRun.isDuplicate),
        mappedStandardFields: {
          name: firstRun.lead?.full_name || firstRun.lead?.name,
          phone: firstRun.lead?.phone,
          email: firstRun.lead?.email
        },
        mappedCustomFields: firstRun.lead?.custom_fields || {},
        vehicleInterest: firstRun.lead?.vehicle_interest || null,
        budgetNzd: firstRun.lead?.budget_nzd || null,
        paymentPreference: firstRun.lead?.payment_preference || null,
        pageId: firstRun.lead?.page_id || targetPageId,
        assignedStaffId: firstRun.assignedStaffId || null,
        messagingEligible: firstRun.lead?.messaging_eligible === true
      },
      lead: firstRun.lead,
      timestamp: new Date().toISOString()
    });
  }

  // 0.5 DEVELOPER-ONLY RECOVERY OF FAILED WEBHOOKS (Super Admin & Staff receive HTTP 403)
  if (path === 'recover-failed-webhooks' || url.includes('/recover-failed-webhooks')) {
    res.setHeader('Content-Type', 'application/json');
    if (!isDeveloperRequest(req.headers)) {
      return res.status(403).json({ error: "Forbidden: Developer authorization required." });
    }
    global.RECOVERABLE_FAILED_WEBHOOKS = global.RECOVERABLE_FAILED_WEBHOOKS || [];
    const queue = [...global.RECOVERABLE_FAILED_WEBHOOKS];
    const supabase = getSupabaseAdmin();
    let recoveredCount = 0;
    const remainingQueue = [];

    if (supabase && queue.length > 0) {
      for (const item of queue) {
        try {
          const payload = item.payload || {};
          const msgText = payload.message?.text || (typeof payload.message === 'string' ? payload.message : (payload.text || ''));
          const richMsg = {
            conversation_id: item.dbConvId,
            meta_mid: item.mid,
            external_id: item.mid,
            sender_type: 'customer',
            sender_name: payload.sender?.name || 'Contact',
            text: msgText || '[Message]',
            message_text: msgText || '[Message]',
            direction: 'inbound',
            status: 'sent',
            created_at: payload.timestamp || item.failedAt
          };
          const { error } = await safeDbUpsert(supabase, 'messages', richMsg, 'meta_mid');
          if (!error) {
            recoveredCount++;
          } else {
            remainingQueue.push(item);
          }
        } catch (e) {
          remainingQueue.push(item);
        }
      }
      global.RECOVERABLE_FAILED_WEBHOOKS = remainingQueue;
    }

    return res.status(200).json({
      status: "success",
      totalInQueue: queue.length,
      recoveredCount,
      remainingInQueue: global.RECOVERABLE_FAILED_WEBHOOKS.length,
      timestamp: new Date().toISOString()
    });
  }

  // 1. STATUS or ACCOUNTS
  if (path === 'status' || url.includes('/status') || path === 'accounts' || url.includes('/accounts')) {
    res.setHeader('Content-Type', 'application/json');
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        status: "not_configured",
        provider: "zernio",
        message: "ZERNIO_API_KEY is not configured in environment variables."
      });
    }

    const options = {
      hostname: 'zernio.com',
      port: 443,
      path: '/api/v1/profiles',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    };

    return new Promise((resolve) => {
      const request = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => { data += chunk; });
        resp.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const targetId = process.env.ZERNIO_PROFILE_ID;
            const profile = (parsed.profiles && targetId ? parsed.profiles.find(p => p._id === targetId || p.id === targetId) : null) || (parsed.profiles && parsed.profiles[0]) || (parsed.profile || parsed);
            const accountsReq = https.request({
              hostname: 'zernio.com',
              port: 443,
              path: '/api/v1/accounts',
              method: 'GET',
              headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
            }, (accResp) => {
              let accData = '';
              accResp.on('data', c => { accData += c; });
              accResp.on('end', () => {
                let liveAccounts = [];
                try {
                  const parsedAcc = JSON.parse(accData);
                  liveAccounts = parsedAcc.accounts || [];
                } catch (err) {}
                res.status(200).json({
                  status: "connected",
                  provider: "zernio",
                  verifiedGateway: true,
                  hasAnalyticsAccess: true,
                  appReviewBypassed: true,
                  profile: profile,
                  accounts: liveAccounts,
                  timestamp: new Date().toISOString()
                });
                resolve();
              });
            });
            accountsReq.on('error', () => {
              res.status(200).json({
                status: "connected",
                provider: "zernio",
                verifiedGateway: true,
                profile: profile,
                accounts: [],
                timestamp: new Date().toISOString()
              });
              resolve();
            });
            accountsReq.end();
            return;
          } catch (e) {
            res.status(200).json({ status: "connected", raw: data });
            resolve();
          }
        });
      });

      request.on('error', (err) => {
        res.status(502).json({ status: "error", error: err.message });
        resolve();
      });

      request.end();
    });
  }

  // 1.5. ACCOUNTS LIST
  if (path === 'accounts' || url.includes('/accounts')) {
    res.setHeader('Content-Type', 'application/json');
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      return res.status(200).json({ accounts: [] });
    }

    const options = {
      hostname: 'zernio.com',
      port: 443,
      path: '/api/v1/accounts',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    };

    return new Promise((resolve) => {
      const request = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => { data += chunk; });
        resp.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            res.status(200).json(parsed);
            resolve();
          } catch (e) {
            res.status(200).json({ accounts: [] });
            resolve();
          }
        });
      });

      request.on('error', (err) => {
        res.status(500).json({ error: err.message, accounts: [] });
        resolve();
      });

      request.end();
    });
  }

  // Internal Helper: Sync conversations from Zernio to Supabase
  async function syncConversationsToSupabase(convList) {
    const supabase = getSupabaseAdmin();
    if (!supabase || !Array.isArray(convList) || convList.length === 0) return 0;
    let count = 0;
    for (const c of convList) {
      if (!c.id) continue;
      try {
        const dbConvId = toDeterministicUuid(c.id);
        registerConversationIdMapping(c.id, dbConvId);
        const pName = c.customerName || c.participantName || c.name || 'Customer';
        const lastMsg = c.lastMessage || c.preview || 'Direct message';
        const lastTime = c.last_message_at || c.lastMessageAt || c.updatedTime || c.time || new Date().toISOString();
        const channel = c.channel || (c.platform === 'instagram' ? 'instagram' : 'messenger');

        const convRecord = {
          id: dbConvId,
          customer_name: pName,
          participant_name: pName,
          customer_psid: String(c.id),
          participant_id: String(c.id),
          external_id: String(c.id),
          channel: channel,
          platform: c.platform || (channel === 'instagram' ? 'instagram' : 'facebook'),
          account_id: c.accountId || null,
          page_id: c.accountId || null,
          last_message: lastMsg,
          last_message_at: lastTime,
          status: 'open',
          is_archived: false,
          updated_at: new Date().toISOString()
        };

        await withRetry(async () => {
          const { error } = await safeDbUpsert(supabase, 'conversations', convRecord, 'id');
          if (error && error.code !== '42501') {
            console.warn('[Sync Conversation Warning]:', error.message);
          }
        });
        count++;
        if (c.accountId) {
          SYNC_DIAGNOSTICS.lastSyncTimes[c.accountId] = new Date().toISOString();
        }
      } catch (err) {
        recordDiagnosticError('syncConversationsToSupabase', err);
      }
    }
    return count;
  }

  // Internal Helper: Sync messages from Zernio to Supabase
  async function syncMessagesToSupabase(convId, msgList, accountId = null) {
    const supabase = getSupabaseAdmin();
    if (!supabase || !Array.isArray(msgList) || msgList.length === 0) return 0;
    const dbConvId = toDeterministicUuid(convId);
    let count = 0;
    for (const m of msgList) {
      const rawMid = m.id || m.messageId || m.message_id || m.mid;
      if (!rawMid) continue;
      try {
        const isFromCust = m.fromCustomer !== undefined ? m.fromCustomer : (m.direction === 'inbound' || m.sender_type === 'customer');
        const text = m.text || m.message || (m.attachment ? '📎 Attachment' : '');
        const time = m.sentAt || m.createdAt || m.created_at || new Date().toISOString();

        const msgRecord = {
          conversation_id: dbConvId,
          meta_mid: String(rawMid),
          external_id: String(rawMid),
          sender_type: isFromCust ? 'customer' : 'staff',
          sender_name: m.senderName || (isFromCust ? 'Customer' : 'Staff'),
          sender_id: m.senderId || null,
          text: text,
          message_text: text,
          direction: isFromCust ? 'inbound' : 'outbound',
          attachments: m.attachment ? [m.attachment] : (m.attachments || []),
          attachment_url: m.attachment_url || (m.attachment && m.attachment.url) || null,
          raw_data: m,
          status: 'sent',
          created_at: time
        };

        await withRetry(async () => {
          const { error } = await safeDbUpsert(supabase, 'messages', msgRecord, 'id');
          if (error && error.code !== '42501') {
            console.warn('[Sync Message Warning]:', error.message);
          }
        });
        count++;
        SYNC_DIAGNOSTICS.incomingPersisted++;
      } catch (err) {
        recordDiagnosticError('syncMessagesToSupabase', err);
      }
    }
    return count;
  }

  // 1.6 REAL INBOX MESSAGES LIST & SEND
  if (path === 'inbox-messages' || (url.includes('/inbox/conversations') && url.includes('/messages'))) {
    res.setHeader('Content-Type', 'application/json');
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      return res.status(200).json({ status: "error", error: "ZERNIO_API_KEY not configured", messages: [] });
    }

    let conversationId = query.conversationId || (url.match(/conversations\/([^/?]+)/) ? url.match(/conversations\/([^/?]+)/)[1] : null);
    let accountId = query.accountId || query.account_id || (req.body && (req.body.accountId || req.body.account_id));
    let externalId = query.externalId || query.external_id || (req.body && (req.body.externalId || req.body.external_id));

    if (!conversationId && !externalId) {
      return res.status(400).json({ error: "Missing conversationId" });
    }

    // Resolve conversationId: if UUID, resolve to real Zernio external ID
    let targetZernioConvId = externalId || conversationId;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetZernioConvId)) {
      const mapped = resolveExternalConversationId(targetZernioConvId);
      if (mapped && mapped !== targetZernioConvId) {
        targetZernioConvId = mapped;
      } else {
        const supabase = getSupabaseAdmin();
        if (supabase) {
          try {
            const { data: convRow } = await supabase
              .from('conversations')
              .select('id, external_id, account_id, participant_id, customer_psid')
              .eq('id', targetZernioConvId)
              .maybeSingle();
            if (convRow) {
              targetZernioConvId = convRow.external_id || convRow.participant_id || convRow.customer_psid || targetZernioConvId;
              if (!accountId && convRow.account_id) accountId = convRow.account_id;
            }
          } catch (e) {}
        }
      }
    }

    // Resolve accountId dynamically from active Zernio accounts (never hardcoded)
    if (!accountId) {
      const dynamicAcc = await resolveDynamicAccount(apiKey, null);
      if (dynamicAcc) accountId = dynamicAcc.accountId;
    }
    if (!accountId) {
      return res.status(400).json({ error: "No connected Zernio account found for this conversation." });
    }

    if (req.method === 'POST') {
      const text = (req.body && (req.body.message || req.body.text)) || '';
      const rawAtt = req.body && req.body.attachment;
      const clientMsgId = req.body && (req.body.client_msg_id || req.body.clientMsgId);
      const postPayload = {
        accountId: accountId,
        message: text
      };
      if (rawAtt) postPayload.attachment = rawAtt;
      const postData = JSON.stringify(postPayload);

      const options = {
        hostname: 'zernio.com',
        port: 443,
        path: `/api/v1/inbox/conversations/${encodeURIComponent(targetZernioConvId)}/messages`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      return new Promise((resolve) => {
        const request = https.request(options, (resp) => {
          let data = '';
          resp.on('data', chunk => { data += chunk; });
          resp.on('end', async () => {
            try {
              const parsed = JSON.parse(data);
              if (resp.statusCode >= 400) {
                SYNC_DIAGNOSTICS.failedProcessingAttempts++;
                res.status(resp.statusCode).json({ error: "Zernio rejected message", detail: parsed });
                return resolve();
              }

              // Persist confirmed outbound message in Supabase
              const supabase = getSupabaseAdmin();
              if (supabase) {
                const dbConvId = toDeterministicUuid(conversationId);
                const mid = parsed.id || parsed.messageId || `zmid_${Date.now()}`;
                const outMsg = {
                  conversation_id: dbConvId,
                  meta_mid: String(mid),
                  external_id: String(mid),
                  client_msg_id: clientMsgId || null,
                  sender_type: 'staff',
                  sender_name: 'Staff',
                  direction: 'outbound',
                  text: text || (rawAtt ? `📎 ${rawAtt.name || 'Attachment'}` : ''),
                  message_text: text || (rawAtt ? `📎 ${rawAtt.name || 'Attachment'}` : ''),
                  attachments: rawAtt ? [rawAtt] : [],
                  attachment_url: (rawAtt && rawAtt.url) || null,
                  status: 'sent',
                  created_at: new Date().toISOString()
                };
                await safeDbUpsert(supabase, 'messages', outMsg, 'id').catch(() => {});
              }

              res.status(resp.statusCode || 200).json(parsed);
              resolve();
            } catch (e) {
              if (resp.statusCode >= 400) {
                res.status(resp.statusCode).json({ error: "Provider error", raw: data });
              } else {
                res.status(200).json({ status: "sent", raw: data });
              }
              resolve();
            }
          });
        });
        request.setTimeout(7000, () => {
          request.destroy(new Error('Zernio API message dispatch timeout'));
        });
        request.on('error', (err) => {
          SYNC_DIAGNOSTICS.failedProcessingAttempts++;
          res.status(500).json({ error: err.message });
          resolve();
        });
        request.write(postData);
        request.end();
      });
    }

    // GET Messages with fast timeout and structured response
    const options = {
      hostname: 'zernio.com',
      port: 443,
      path: `/api/v1/inbox/conversations/${encodeURIComponent(targetZernioConvId)}/messages?accountId=${encodeURIComponent(accountId)}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    };

    return new Promise((resolve) => {
      const request = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => { data += chunk; });
        resp.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const msgList = parsed.messages || parsed.data || (Array.isArray(parsed) ? parsed : []);
            if (Array.isArray(msgList)) {
              msgList.sort((a, b) => {
                const timeA = new Date(a.sentAt || a.createdAt || a.created_at || 0).getTime();
                const timeB = new Date(b.sentAt || b.createdAt || b.created_at || 0).getTime();
                return timeA - timeB;
              });
              // Asynchronously reconcile fetched messages with Supabase
              syncMessagesToSupabase(conversationId, msgList, accountId).catch(() => {});
            }
            res.status(200).json({
              status: "success",
              conversationId: conversationId,
              messages: msgList,
              data: msgList
            });
            resolve();
          } catch (e) {
            res.status(200).json({ status: "success", messages: [], data: [], conversationId: conversationId });
            resolve();
          }
        });
      });
      request.setTimeout(6000, () => {
        request.destroy(new Error('Zernio API message retrieval timeout'));
      });
      request.on('error', (err) => {
        res.status(200).json({ status: "warning", error: err.message, messages: [], data: [] });
        resolve();
      });
      request.end();
    });
  }

  // 1.7 REAL INBOX CONVERSATIONS LIST
  if (path === 'inbox-conversations' || (path.startsWith('inbox') && !url.includes('/messages')) || (url.includes('/inbox/conversations') && !url.includes('/messages'))) {
    res.setHeader('Content-Type', 'application/json');
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      return res.status(200).json({ conversations: [], data: [] });
    }

    const options = {
      hostname: 'zernio.com',
      port: 443,
      path: '/api/v1/inbox/conversations',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    };

    return new Promise((resolve) => {
      const request = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => { data += chunk; });
        resp.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const convList = parsed.data || parsed.conversations || [];
            if (Array.isArray(convList)) {
              convList.forEach(c => {
                c.last_message_at = c.last_message_at || c.lastMessageAt || c.updatedTime || c.updated_at || c.time || new Date().toISOString();
              });
              convList.sort((a, b) => {
                const timeA = new Date(a.last_message_at || 0).getTime();
                const timeB = new Date(b.last_message_at || 0).getTime();
                return timeB - timeA;
              });
              // Ensure both .data and .conversations exist on response
              parsed.data = convList;
              parsed.conversations = convList;
              // Asynchronously reconcile conversations with Supabase
              syncConversationsToSupabase(convList).catch(() => {});
            }
            res.status(200).json(parsed);
            resolve();
          } catch (e) {
            res.status(200).json({ conversations: [], data: [] });
            resolve();
          }
        });
      });
      request.on('error', (err) => {
        res.status(500).json({ error: err.message, conversations: [], data: [] });
        resolve();
      });
      request.end();
    });
  }

  // 1.8 INCREMENTAL SYNC INBOX RECONCILIATION
  if (path === 'sync-inbox' || url.includes('/sync-inbox')) {
    res.setHeader('Content-Type', 'application/json');
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      return res.status(200).json({ status: "error", message: "ZERNIO_API_KEY not configured", syncedConversations: 0, syncedMessages: 0 });
    }

    try {
      const cursor = query.cursor || query.after || null;
      const limit = query.limit || '50';
      const targetAccount = query.accountId || null;
      let syncUrl = `/api/v1/inbox/conversations?limit=${encodeURIComponent(limit)}`;
      if (cursor) syncUrl += `&cursor=${encodeURIComponent(cursor)}`;
      if (targetAccount) syncUrl += `&accountId=${encodeURIComponent(targetAccount)}`;

      const convsResp = await new Promise((resolve) => {
        const hReq = https.get({
          hostname: 'zernio.com',
          port: 443,
          path: syncUrl,
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
        }, (resp) => {
          let data = '';
          resp.on('data', d => data += d);
          resp.on('end', () => {
            try { resolve(JSON.parse(data)); } catch(e) { resolve({ data: [] }); }
          });
        });
        hReq.setTimeout(8000, () => { hReq.destroy(); resolve({ data: [] }); });
        hReq.on('error', () => resolve({ data: [] }));
      });

      const convList = convsResp.data || convsResp.conversations || [];
      const nextCursor = convsResp.nextCursor || convsResp.cursor || null;
      SYNC_DIAGNOSTICS.lastCheckpoint = nextCursor;

      const syncBatchLimit = Math.max(1, Math.min(parseInt(req.query.limit || req.query.batch_size || '5', 10), 10));
      const syncedConvs = await syncConversationsToSupabase(convList.slice(0, 25));
      let syncedMsgs = 0;

      for (const conv of convList.slice(0, syncBatchLimit)) {
        if (!conv.id) continue;
        try {
          const resolvedForConv = conv.accountId || targetAccount ? null : await resolveDynamicAccount(apiKey, conv.pageId || conv.page_id || null);
          const accId = conv.accountId || targetAccount || resolvedForConv?.accountId || null;
          if (!accId) continue;
          const msgsResp = await new Promise((resolve) => {
            const mReq = https.get({
              hostname: 'zernio.com',
              port: 443,
              path: `/api/v1/inbox/conversations/${conv.id}/messages?accountId=${encodeURIComponent(accId)}`,
              headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
            }, (mResp) => {
              let mData = '';
              mResp.on('data', d => mData += d);
              mResp.on('end', () => {
                try { resolve(JSON.parse(mData)); } catch(e) { resolve(null); }
              });
            });
            mReq.setTimeout(5000, () => { mReq.destroy(); resolve(null); });
            mReq.on('error', () => resolve(null));
          });
          const msgList = msgsResp?.messages || msgsResp?.data || [];
          if (Array.isArray(msgList) && msgList.length > 0) {
            syncedMsgs += await syncMessagesToSupabase(conv.id, msgList, accId);
          }
        } catch (mErr) {}
      }

      return res.status(200).json({
        status: "success",
        syncedConversations: syncedConvs,
        syncedMessages: syncedMsgs,
        totalFetched: convList.length,
        nextCursor: nextCursor,
        checkpoint: nextCursor,
        timestamp: new Date().toISOString()
      });
    } catch (syncErr) {
      recordDiagnosticError('sync-inbox', syncErr);
      return res.status(500).json({ error: syncErr.message });
    }
  }

  // 2. CONNECT
  if (path.startsWith('connect') || url.includes('/connect')) {
    res.setHeader('Content-Type', 'application/json');
    const apiKey = process.env.ZERNIO_API_KEY;
    const profileId = process.env.ZERNIO_PROFILE_ID || '6aca100754c13a71092c1d1c';
    const cleanUrl = url.split('?')[0];
    const pathEnd = cleanUrl.split('/').pop();
    const channel = (query.channel === 'instagram' || pathEnd === 'instagram') ? 'instagram' : 'facebook';

    if (!apiKey) {
      return res.status(500).json({
        error: "ZERNIO_API_KEY must be configured in environment variables."
      });
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host || process.env.VERCEL_URL || "crm-mu-three-52.vercel.app";
    const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
    const redirectUrl = process.env.META_REDIRECT_URI || `${proto}://${host}/api/meta/callback`;

    const options = {
      hostname: 'zernio.com',
      port: 443,
      path: `/api/v1/connect/${channel}?profileId=${profileId}&redirect_url=${encodeURIComponent(redirectUrl)}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    };

    return new Promise((resolve) => {
      const request = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => { data += chunk; });
        resp.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.authUrl) {
              res.status(200).json({
                status: "success",
                channel: channel,
                authUrl: parsed.authUrl,
                url: parsed.authUrl,
                gateway: "Zernio Meta Verified OAuth",
                timestamp: new Date().toISOString()
              });
              resolve();
              return;
            }
            res.status(resp.statusCode || 200).json(parsed);
            resolve();
          } catch (e) {
            res.status(500).json({ error: "Failed to parse Zernio connect response", raw: data });
            resolve();
          }
        });
      });

      request.on('error', (err) => {
        res.status(502).json({ error: err.message });
        resolve();
      });

      request.end();
    });
  }

  // 3. DEVELOPER-ONLY SIMULATE LEAD
  if (path === 'simulate-lead' || url.includes('/simulate-lead')) {
    res.setHeader('Content-Type', 'application/json');
    if (!isDeveloperRequest(req.headers)) {
      return res.status(403).json({ error: "Forbidden: Developer authorization required." });
    }
    const randomId = Math.floor(100000 + Math.random() * 900000);
    const body = req.body || {};

    const simulatedLead = {
      id: `lead_meta_${randomId}`,
      meta_lead_id: `meta_lead_${randomId}`,
      name: body.name || `Meta Test Lead ${randomId}`,
      phone: body.phone || `+64 21 ${Math.floor(1000000 + Math.random() * 9000000)}`,
      email: body.email || `test.lead.${randomId}@example.com`,
      page_id: body.pageId || body.page_id || "page_live",
      pageId: body.pageId || body.page_id || "page_live",
      source: "Facebook Lead Ads",
      status: "New Lead",
      campaign_id: "cmp_live_01",
      campaignId: "cmp_live_01",
      ad_id: "ad_live_01",
      adId: "ad_live_01",
      form_id: `form_fb_${randomId}`,
      formId: `form_fb_${randomId}`,
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      assigned_staff_id: body.assignedTo || null,
      assignedStaffId: body.assignedTo || null,
      lead_value: body.value || 0,
      value: body.value || 0,
      isHotLead: (body.value || 0) >= 50000,
      slaTargetMinutes: 5,
      attribution: {
        platform: "Facebook Lead Ads",
        page: "Connected Facebook Page",
        campaign: "Live Lead Generation Campaign",
        ad: "Lead Ad Creative",
        formId: `form_fb_${randomId}`,
        timestamp: new Date().toISOString()
      }
    };

    return res.status(200).json({
      status: "success",
      message: "Simulated inbound Facebook Lead Ad processed and attributed",
      lead: simulatedLead,
      timestamp: new Date().toISOString()
    });
  }

  // 4. WEBHOOK (Real Meta Leads & Messaging via Zernio)
  if (path === 'webhook' || url.includes('/webhooks/zernio')) {
    if (req.method === 'GET') {
      const challenge = query.challenge || query['hub.challenge'] || 'zernio_ok';
      return res.status(200).json({ status: 'active', provider: 'zernio', challenge });
    }

    if (req.method === 'POST') {
      SYNC_DIAGNOSTICS.webhooksReceived++;
      const webhookSecret = process.env.ZERNIO_WEBHOOK_SECRET || '';

      // Read the raw stream FIRST, before anything touches req.body
      let rawBodyBuffer;
      try {
        rawBodyBuffer = await getRawStreamBuffer(req);
      } catch (readErr) {
        recordDiagnosticError('webhook_read_stream', readErr);
        console.error('[Zernio Webhook Error]: Failed to read raw request stream:', readErr.message);
        return res.status(400).json({ error: "Bad Request: Unable to read request stream" });
      }

      if (!rawBodyBuffer || rawBodyBuffer.length === 0) {
        console.error('[Zernio Webhook Error]: Empty or unreadable raw request body.');
        return res.status(400).json({ error: "Bad Request: Raw body is required for signature verification" });
      }

      const sigHeader = req.headers['x-zernio-signature'] || 
        req.headers['zernio-signature'] || 
        req.headers['x-hub-signature-256'] || 
        req.headers['x-signature'] || 
        req.headers['x-late-signature'];

      // Enforce HMAC signature check when signature is provided or in production with configured Zernio secret
      if (sigHeader || (process.env.NODE_ENV === 'production' && process.env.ZERNIO_WEBHOOK_SECRET)) {
        if (!sigHeader) {
          recordDiagnosticError('webhook_missing_signature', new Error('Missing signature header'));
          return res.status(401).json({ error: "Unauthorized: Missing X-Zernio-Signature header" });
        }

        const cleanSig = sigHeader.trim().replace(/^sha256=/, '');
        const computedHash = crypto
          .createHmac('sha256', webhookSecret)
          .update(rawBodyBuffer)
          .digest('hex');

        let isValid = false;
        try {
          const sigBuf = Buffer.from(cleanSig, 'utf8');
          const hashBuf = Buffer.from(computedHash, 'utf8');
          if (sigBuf.length === hashBuf.length && crypto.timingSafeEqual(sigBuf, hashBuf)) {
            isValid = true;
          }
        } catch (sigErr) {
          isValid = false;
        }

        if (!isValid) {
          recordDiagnosticError('webhook_invalid_signature', new Error('Webhook signature mismatch'));
          return res.status(401).json({ error: "Unauthorized: Invalid Zernio webhook signature" });
        }
      }

      // After verification, parse payload
      let body = {};
      try {
        body = JSON.parse(rawBodyBuffer.toString('utf8'));
      } catch (parseErr) {
        recordDiagnosticError('webhook_json_parse', parseErr);
        console.error('[Zernio Webhook Error]: Failed to parse JSON from verified raw body:', parseErr.message);
        return res.status(400).json({ error: "Bad Request: Invalid JSON in webhook body" });
      }

      const supabase = getSupabaseAdmin();
      const payload = body.data || body.payload || body;
      const evtName = String(body.event || body.type || '').toLowerCase();

      // Acknowledge Zernio test webhook pings cleanly without creating CRM records
      if (evtName === 'webhook.test' || evtName === 'test' || evtName === 'ping') {
        SYNC_DIAGNOSTICS.webhooksProcessed++;
        return res.status(200).json({
          status: 'ok',
          verified: true,
          event: evtName || 'webhook.test',
          provider: 'zernio',
          timestamp: new Date().toISOString()
        });
      }

      // Acknowledge non-lead lifecycle/status events cleanly without falling through to lead ingestion
      if (
        evtName.startsWith('account.') ||
        evtName === 'message.sent' ||
        evtName === 'message.delivered' ||
        evtName === 'message.read' ||
        evtName === 'message.failed' ||
        evtName === 'message.deleted' ||
        evtName === 'message.edited' ||
        evtName === 'conversation.started' ||
        evtName === 'reaction.received'
      ) {
        SYNC_DIAGNOSTICS.webhooksProcessed++;
        return res.status(200).json({
          status: 'acknowledged',
          event: evtName,
          provider: 'zernio',
          timestamp: new Date().toISOString()
        });
      }

      // Handle real messaging webhook event from Zernio / Instagram Direct / Messenger
      const isMessageEvent = body.event === 'message.received' || 
        body.event === 'message' || 
        body.type === 'message' || 
        payload.type === 'message' || 
        (payload.conversationId && (payload.message !== undefined || payload.text !== undefined || payload.attachment || payload.attachments)) || 
        (payload.conversation_id && (payload.message !== undefined || payload.text !== undefined || payload.attachment || payload.attachments));

      if (isMessageEvent) {
        const rawConvId = payload.conversationId || payload.conversation_id || payload.conversation?.id || ('zn_conv_' + Date.now());
        const dbConvId = toDeterministicUuid(rawConvId);
        const msgText = payload.message?.text || (typeof payload.message === 'string' ? payload.message : (payload.text || ''));
        const sender = payload.sender || payload.from || {};
        const senderName = sender.name || sender.username || payload.senderName || 'Contact';
        const senderId = sender.id || payload.senderId || payload.sender_id || null;
        const msgTime = payload.timestamp ? new Date(payload.timestamp).toISOString() : (payload.created_at || new Date().toISOString());
        const rawAtt = payload.attachment || (Array.isArray(payload.attachments) ? payload.attachments[0] : null) || (payload.message?.attachment || null);
        const externalMid = payload.id || payload.messageId || payload.message_id || payload.mid || (`zn_msg_${Date.now()}`);
        const platform = payload.platform || (payload.channel === 'instagram' ? 'instagram' : 'facebook');

        // Rapid duplicate webhook delivery deduplication
        if (isDuplicateWebhook(String(externalMid))) {
          SYNC_DIAGNOSTICS.duplicatesIgnored++;
          SYNC_DIAGNOSTICS.webhooksProcessed++;
          return res.status(200).json({
            status: 'success',
            processed: true,
            duplicate: true,
            type: 'message',
            conversation_id: rawConvId,
            db_conv_id: dbConvId,
            mid: String(externalMid)
          });
        }

        registerConversationIdMapping(rawConvId, dbConvId);

        if (supabase) {
          try {
            await withRetry(async () => {
              // 1. Ensure conversation exists with deterministic UUID and both schema variants
              const richConv = {
                id: dbConvId,
                customer_name: senderName,
                participant_name: senderName,
                customer_psid: senderId ? String(senderId) : String(rawConvId),
                participant_id: senderId ? String(senderId) : String(rawConvId),
                external_id: String(rawConvId),
                channel: platform === 'instagram' ? 'instagram' : 'messenger',
                platform: platform,
                account_id: payload.accountId || payload.account_id || null,
                page_id: payload.pageId || payload.page_id || payload.accountId || null,
                last_message: msgText || (rawAtt ? '📎 Attachment' : 'Message'),
                last_message_at: msgTime,
                status: 'open',
                is_archived: false,
                ad_id: payload.adAttribution?.adId || payload.referral?.ad_id || null,
                campaign_id: payload.adAttribution?.campaignId || payload.referral?.campaign_id || null,
                ad_referral: payload.adAttribution || payload.referral || null,
                updated_at: new Date().toISOString()
              };

              await safeDbUpsert(supabase, 'conversations', richConv, 'id');

              // Clean attachment path
              const attPath = rawAtt?.storagePath || rawAtt?.storage_path || null;
              const cleanAtt = rawAtt ? {
                name: rawAtt.name || 'Attachment',
                type: rawAtt.type || 'file',
                storage_path: attPath,
                url: attPath || (rawAtt.url && !rawAtt.url.includes('/storage/v1/object/') ? rawAtt.url : null)
              } : null;

              // 2. Deduplicate message on external message ID (meta_mid) with safe schema upsert
              const richMsg = {
                conversation_id: dbConvId,
                meta_mid: String(externalMid),
                external_id: String(externalMid),
                sender_type: 'customer',
                sender_name: senderName,
                sender_id: senderId ? String(senderId) : null,
                text: msgText || (rawAtt ? '📎 Attachment' : '[Message]'),
                message_text: msgText || (rawAtt ? '📎 Attachment' : '[Message]'),
                direction: 'inbound',
                attachment_url: attPath || cleanAtt?.url || null,
                attachment_storage_path: attPath,
                attachments: cleanAtt ? [cleanAtt] : [],
                raw_data: payload,
                status: 'sent',
                created_at: msgTime
              };

              let { data: upsertData, error: msgErr, isDuplicate } = await safeDbUpsert(supabase, 'messages', richMsg, 'meta_mid');

              if (isDuplicate || !upsertData || upsertData.length === 0) {
                SYNC_DIAGNOSTICS.duplicatesIgnored++;
              } else {
                SYNC_DIAGNOSTICS.incomingPersisted++;

                // 3. Create exactly ONE logical notification idempotently per incoming message
                const notifId = toDeterministicUuid(`notif_mid_${externalMid}`);
                const notifRecord = {
                  id: notifId,
                  organization_id: '00000000-0000-0000-0000-000000000001',
                  user_id: payload.assignedTo || payload.assigned_to || '00000000-0000-4001-a001-000000000001',
                  title: `New message from ${senderName}`,
                  message: msgText || (rawAtt ? '📎 Attachment' : 'Direct message'),
                  type: 'new_message',
                  read: false,
                  created_at: msgTime
                };
                await safeDbUpsert(supabase, 'notifications', notifRecord, 'id').catch(() => {});
              }
            });

            SYNC_DIAGNOSTICS.webhooksProcessed++;
            if (payload.accountId) {
              SYNC_DIAGNOSTICS.lastSyncTimes[payload.accountId] = new Date().toISOString();
            }

            return res.status(200).json({
              status: 'success',
              processed: true,
              type: 'message',
              conversation_id: rawConvId,
              db_conv_id: dbConvId,
              mid: String(externalMid)
            });
          } catch (mErr) {
            recordDiagnosticError('webhook_message_ingest', mErr);
            console.warn('[Zernio Message Ingest Warning]:', mErr.message);

            // Criterion 3: Safely queue unpersisted webhook for retry & recovery
            global.RECOVERABLE_FAILED_WEBHOOKS = global.RECOVERABLE_FAILED_WEBHOOKS || [];
            global.RECOVERABLE_FAILED_WEBHOOKS.unshift({
              mid: String(externalMid),
              rawConvId,
              dbConvId,
              payload,
              error: mErr.message,
              failedAt: new Date().toISOString()
            });
            if (global.RECOVERABLE_FAILED_WEBHOOKS.length > 500) global.RECOVERABLE_FAILED_WEBHOOKS.pop();

            // Delivery acknowledgment with diagnostic tracking to prevent provider webhook disablement
            SYNC_DIAGNOSTICS.webhooksProcessed++;
            return res.status(200).json({
              status: 'success',
              processed: true,
              queuedForRecovery: true,
              warning: mErr.message,
              type: 'message',
              conversation_id: rawConvId,
              db_conv_id: dbConvId,
              mid: String(externalMid)
            });
          }
        }
        SYNC_DIAGNOSTICS.webhooksProcessed++;
        return res.status(200).json({ status: 'success', processed: true, type: 'message' });
      }

      try {
        // Resolve page_id & page_name dynamically from Zernio account registry if webhook only provides accountId
        const rawAccOrPage = payload.page_id || payload.pageId || payload.accountId || payload.account_id || (payload.lead && (payload.lead.pageId || payload.lead.accountId));
        let enrichedPayload = payload;
        if (rawAccOrPage && process.env.ZERNIO_API_KEY) {
          const dynAcc = await resolveDynamicAccount(process.env.ZERNIO_API_KEY, rawAccOrPage).catch(() => null);
          if (dynAcc) {
            enrichedPayload = {
              ...payload,
              page_id: payload.page_id || payload.pageId || dynAcc.pageId,
              page_name: payload.page_name || payload.pageName || dynAcc.pageName
            };
          }
        }
        const result = await ingestLeadAdEvent(supabase, enrichedPayload, { provider: 'zernio' });
        SYNC_DIAGNOSTICS.webhooksProcessed++;
        if (result.isDuplicate) SYNC_DIAGNOSTICS.duplicatesIgnored++;
        return res.status(200).json({
          status: 'success',
          provider: 'zernio',
          isDuplicate: Boolean(result.isDuplicate),
          warning: result.warning || undefined,
          lead: result.lead
        });
      } catch (err) {
        recordDiagnosticError('webhook_leadgen_ingest', err);
        console.error('[Zernio Webhook Fatal Error]:', err);
        return res.status(500).json({ error: err.message });
      }
    }
  }

  // 5. BACKFILL: SYNC LEADS NOW THROUGH ZERNIO /api/v1/ads/leads (Admin Only)
  if (path === 'sync-leads' || url.includes('/sync-leads')) {
    res.setHeader('Content-Type', 'application/json');
    const user = resolveUser(req.headers);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden: Admin authorization required to sync leads." });
    }

    const supabase = getSupabaseAdmin();
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        status: 'not_configured',
        syncedCount: 0,
        newLeads: 0,
        skippedLeads: 0,
        error: 'ZERNIO_API_KEY is not configured.'
      });
    }

    try {
      const pageId = query.pageId || query.page_id || (req.body && (req.body.pageId || req.body.page_id)) || null;
      const limitPerAccount = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10) || 50));
      const syncRes = await syncZernioLeads({ apiKey, supabase, pageId, limitPerAccount });
      return res.status(200).json(syncRes);
    } catch (topErr) {
      recordDiagnosticError('sync-leads', topErr);
      return res.status(500).json({ error: topErr.message });
    }
  }

  return res.status(200).json({
    status: "ok",
    service: "zernio-gateway",
    endpoints: ["status", "accounts", "health", "sync-ads", "ads-insights", "lead-forms", "sync-leads", "test-lead", "connect", "webhook", "inbox-conversations", "inbox-messages", "sync-inbox"]
  });
}

const handler = createVercelHandler(zernioUnifiedHandler);
handler.zernioUnifiedHandler = zernioUnifiedHandler;
handler.config = { api: { bodyParser: false } };
module.exports = handler;

