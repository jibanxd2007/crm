/**
 * Zernio Dynamic Page Registry, Multi-Stage Connection Health,
 * Lead Ads Sync, and Meta Ads Insights Sync Client.
 *
 * Zero hardcoded page IDs — every accountId <-> pageId <-> pageName mapping
 * is derived dynamically from live Zernio /api/v1/accounts and stored DB pages.
 */

const https = require('https');
const { ingestLeadAdEvent } = require('./lead-ingestion.js');
const { safeDbUpsert } = require('./index.js');

const PERSONAL_FILTER_TERMS = ['jiban', 'prakash', 'omm'];

global.ZERNIO_ACCOUNT_CACHE = global.ZERNIO_ACCOUNT_CACHE || { fetchedAt: 0, accounts: [], byAccountId: new Map(), byPageId: new Map() };
global.ZERNIO_SYNC_INFLIGHT = global.ZERNIO_SYNC_INFLIGHT || new Map(); // Per-resource single-flight lock with expiring lease
global.ZERNIO_ADS_SYNC_CACHE = global.ZERNIO_ADS_SYNC_CACHE || {
  lastSuccessfulSync: null,
  lastAttemptedSync: null,
  insightsRetrievedSuccessfully: false,
  partialFailure: false,
  lastWindow: null,
  allAdAccounts: [],
  adAccounts: [],
  excludedNonNzdAccounts: [],
  campaigns: [],
  totals: null,
  errors: []
};
global.ZERNIO_LEADS_SYNC_CACHE = global.ZERNIO_LEADS_SYNC_CACHE || {
  lastSuccessfulSync: null,
  forms: [],
  recentLeadCount: 0,
  lastLeadReceivedAt: null
};

async function runWithLease(lockKey, leaseMs, fn) {
  const now = Date.now();
  const existing = global.ZERNIO_SYNC_INFLIGHT.get(lockKey);
  if (existing && existing.expiresAt > now && existing.promise) {
    return existing.promise;
  }
  const promise = Promise.resolve().then(fn).finally(() => {
    const cur = global.ZERNIO_SYNC_INFLIGHT.get(lockKey);
    if (cur && cur.promise === promise) {
      global.ZERNIO_SYNC_INFLIGHT.delete(lockKey);
    }
  });
  global.ZERNIO_SYNC_INFLIGHT.set(lockKey, { promise, startedAt: now, expiresAt: now + leaseMs });
  return promise;
}

async function mapWithBoundedConcurrency(items, concurrency, worker) {
  if (typeof concurrency === 'function') {
    const tmp = concurrency;
    concurrency = typeof worker === 'number' ? worker : 4;
    worker = tmp;
  }
  concurrency = typeof concurrency === 'number' && concurrency > 0 ? concurrency : 4;
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

function isExcludedPersonalAccount(acc) {
  const name = String(acc?.metadata?.selectedPageName || acc?.displayName || acc?.username || '').toLowerCase();
  return PERSONAL_FILTER_TERMS.some(term => name.includes(term));
}

function zernioGet(apiKey, apiPath, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!apiKey) return reject(new Error('ZERNIO_API_KEY is not configured'));
    const req = https.get({
      hostname: 'zernio.com',
      port: 443,
      path: apiPath,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    }, (resp) => {
      let data = '';
      resp.on('data', chunk => { data += chunk; });
      resp.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) {}
        if (resp.statusCode >= 400) {
          const err = new Error(parsed?.error || parsed?.message || `Zernio HTTP ${resp.statusCode}`);
          err.statusCode = resp.statusCode;
          err.body = parsed || data;
          return reject(err);
        }
        resolve(parsed || {});
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Zernio API timeout (${timeoutMs}ms) on ${apiPath}`));
    });
    req.on('error', reject);
  });
}

async function zernioGetWithRetry(apiKey, apiPath, { maxRetries = 3, baseDelayMs = 250, timeoutMs = 9000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await zernioGet(apiKey, apiPath, timeoutMs);
    } catch (err) {
      lastErr = err;
      const code = err.statusCode || 0;
      // Stop immediately on permanent 4xx errors except 429 rate-limit
      if (code >= 400 && code < 500 && code !== 429) break;
      if (attempt < maxRetries) {
        const delay = (baseDelayMs * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 80);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

/**
 * Fetches business accounts dynamically from Zernio and updates the in-memory registry.
 */
async function getDynamicZernioAccounts(apiKey, { forceRefresh = false, maxAgeMs = 60000 } = {}) {
  const now = Date.now();
  if (!forceRefresh && global.ZERNIO_ACCOUNT_CACHE.accounts.length > 0 && (now - global.ZERNIO_ACCOUNT_CACHE.fetchedAt) < maxAgeMs) {
    return global.ZERNIO_ACCOUNT_CACHE;
  }
  if (!apiKey) {
    return global.ZERNIO_ACCOUNT_CACHE;
  }

  const resp = await zernioGetWithRetry(apiKey, '/api/v1/accounts', { maxRetries: 2, timeoutMs: 8000 });
  const rawAccounts = Array.isArray(resp?.accounts) ? resp.accounts : [];
  const businessAccounts = rawAccounts
    .filter(a => !isExcludedPersonalAccount(a))
    .map(a => {
      const accountId = String(a._id || a.id || '');
      const pageId = String(a.metadata?.selectedPageId || a.platformUserId || accountId);
      const pageName = String(a.metadata?.selectedPageName || a.displayName || a.username || 'Connected Page').trim();
      const platform = a.platform || 'facebook';
      return {
        raw: a,
        accountId,
        pageId,
        pageName,
        platform,
        username: a.username || null,
        profilePicture: a.profilePicture || a.metadata?.profilePicture || null,
        permissions: Array.isArray(a.permissions) ? a.permissions : [],
        isActive: a.isActive !== false,
        needsReconnection: Boolean(a.needsReconnection),
        tokenExpiresAt: a.tokenExpiresAt || null,
        leadgenSubscribed: Boolean(a.metadata?.leadgenSubscribed),
        messagingSubscribed: a.metadata?.messagingSubscribed !== false
      };
    });

  const byAccountId = new Map();
  const byPageId = new Map();
  for (const acc of businessAccounts) {
    if (acc.accountId) byAccountId.set(acc.accountId, acc);
    if (acc.pageId) byPageId.set(acc.pageId, acc);
  }

  global.ZERNIO_ACCOUNT_CACHE = {
    fetchedAt: now,
    accounts: businessAccounts,
    byAccountId,
    byPageId
  };
  return global.ZERNIO_ACCOUNT_CACHE;
}

/**
 * Resolves ANY identifier (Zernio accountId OR Meta pageId) dynamically to its canonical account record.
 */
async function resolveDynamicAccount(apiKey, idOrNull) {
  const cache = await getDynamicZernioAccounts(apiKey).catch(() => global.ZERNIO_ACCOUNT_CACHE);
  if (idOrNull) {
    const key = String(idOrNull).trim();
    if (cache.byAccountId.has(key)) return cache.byAccountId.get(key);
    if (cache.byPageId.has(key)) return cache.byPageId.get(key);
  }
  return cache.accounts.find(a => a.isActive && !a.needsReconnection) || cache.accounts[0] || null;
}

function getNzDateString(dateObj = new Date()) {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(dateObj);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function resolveDateWindow({ since, until, range = 'last_30d' } = {}) {
  if (since && until) return { since, until, range: 'custom' };
  const now = new Date();
  const endStr = until || getNzDateString(now);
  let daysBack = 30;
  if (range === 'today') daysBack = 0;
  else if (range === 'yesterday') daysBack = 1;
  else if (range === 'last_7d' || range === '7d') daysBack = 6;
  else if (range === 'last_14d' || range === '14d') daysBack = 13;
  else if (range === 'last_90d' || range === '90d') daysBack = 89;
  else if (range === 'this_month') {
    const [y, m] = endStr.split('-');
    return { since: `${y}-${m}-01`, until: endStr, range };
  }
  const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const startStr = since || getNzDateString(startDate);
  if (range === 'yesterday') return { since: startStr, until: startStr, range };
  return { since: startStr, until: endStr, range };
}

function extractActionCount(actions = [], actionTypes = []) {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const a of actions) {
    if (a && actionTypes.includes(a.action_type)) {
      total += Number(a.value || 0);
    }
  }
  return total;
}

/**
 * Syncs Meta Ad Accounts and Campaign Insights through Zernio with:
 * - Single-flight per-resource concurrency lease (joining in-flight syncs on rapid Refresh)
 * - Live paginated ad-account discovery (live=true + cursor pagination)
 * - Native currency preservation without hiding non-NZD accounts
 * - Bounded concurrency (4 workers) for fast multi-account sync
 * - Exact record-grain deduplication (adAccountId + campaignId + since + until + level)
 * - Partial-failure honesty & cache preservation (never wipes prior records on error)
 * - Attribution linking to CRM enquiries
 */
async function syncZernioAdsInsights({ apiKey, supabase = null, since = null, until = null, range = 'last_30d', pageId = null, selectedAdAccountIds = null, maxPagesPerAccount = 5 } = {}) {
  const windowInfo = resolveDateWindow({ since, until, range });
  const selectedKey = Array.isArray(selectedAdAccountIds) ? selectedAdAccountIds.slice().sort().join(',') : 'all';
  const leaseKey = `ads_insights::${windowInfo.since}::${windowInfo.until}::${pageId || 'all'}::${selectedKey}`;

  return runWithLease(leaseKey, 45000, async () => {
    const tStart = Date.now();
    const cache = await getDynamicZernioAccounts(apiKey, { forceRefresh: true });
    const targetAccounts = pageId && pageId !== 'all'
      ? cache.accounts.filter(a => a.pageId === String(pageId) || a.accountId === String(pageId))
      : cache.accounts;

    const uniqueAdAccounts = new Map();
    const errors = [];

    // 1. Discover ALL ad accounts across connected Zernio accounts with live=true & cursor pagination
    await mapWithBoundedConcurrency(targetAccounts, 4, async (acc) => {
      let cursor = null;
      let pageNum = 0;
      while (pageNum < 5) {
        pageNum++;
        try {
          let adAccPath = `/api/v1/ads/accounts?accountId=${encodeURIComponent(acc.accountId)}&live=true&limit=100`;
          if (cursor) adAccPath += `&cursor=${encodeURIComponent(cursor)}`;
          const resp = await zernioGetWithRetry(apiKey, adAccPath, { maxRetries: 2, timeoutMs: 8000 });
          const list = Array.isArray(resp?.accounts) ? resp.accounts : (Array.isArray(resp?.adAccounts) ? resp.adAccounts : (Array.isArray(resp?.data) ? resp.data : []));
          for (const adAcc of list) {
            const adAccId = String(adAcc.id || adAcc.account_id || '');
            if (!adAccId) continue;
            // Currency is strictly taken from provider payload — NEVER inferred from account name
            const nativeCurrency = String(adAcc.currency || 'UNKNOWN').toUpperCase();
            const isNzd = nativeCurrency === 'NZD';
            if (!uniqueAdAccounts.has(adAccId)) {
              uniqueAdAccounts.set(adAccId, {
                id: adAccId,
                name: adAcc.name || adAccId,
                currency: nativeCurrency,
                status: adAcc.accountStatus ?? adAcc.status ?? 'unknown',
                billingStatus: adAcc.billingStatus || null,
                timezoneName: adAcc.timezoneName || null,
                isNzd,
                reportingEligibleNzd: isNzd,
                exclusionReason: isNzd ? null : `Billed in ${nativeCurrency} — excluded from NZD totals`,
                zernioAccountId: acc.accountId,
                primaryPageId: acc.pageId,
                primaryPageName: acc.pageName,
                linkedPageIds: [acc.pageId],
                linkedPageNames: [acc.pageName]
              });
            } else {
              const existing = uniqueAdAccounts.get(adAccId);
              if (!existing.linkedPageIds.includes(acc.pageId)) existing.linkedPageIds.push(acc.pageId);
              if (!existing.linkedPageNames.includes(acc.pageName)) existing.linkedPageNames.push(acc.pageName);
            }
          }
          const nextCursor = resp?.pagination?.nextCursor || resp?.nextCursor || resp?.paging?.cursors?.after || null;
          if (!nextCursor || list.length === 0) break;
          cursor = nextCursor;
        } catch (err) {
          errors.push({ scope: 'ad_accounts', accountId: acc.accountId, pageName: acc.pageName, error: err.message });
          break;
        }
      }
    });

    const allAdAccounts = Array.from(uniqueAdAccounts.values());
    const allowedSet = Array.isArray(selectedAdAccountIds) && selectedAdAccountIds.length > 0
      ? new Set(selectedAdAccountIds.map(String))
      : null;
    const nzdAdAccounts = allAdAccounts.filter(a => a.isNzd && (!allowedSet || allowedSet.has(a.id)));
    const excludedNonNzdAccounts = allAdAccounts.filter(a => !a.isNzd);

    // 2. Fetch paginated campaign-level insights with bounded concurrency (4 workers)
    //    Record grain: (adAccountId, campaignId, dateSince, dateUntil, level='campaign')
    const campaignsByGrain = new Map();
    let insightsSuccessCount = 0;

    await mapWithBoundedConcurrency(nzdAdAccounts, 4, async (adAcc) => {
      let afterCursor = null;
      let pagesFetched = 0;
      let accountOk = false;

      while (pagesFetched < maxPagesPerAccount) {
        pagesFetched++;
        let path = `/api/v1/ads/insights?accountId=${encodeURIComponent(adAcc.zernioAccountId)}&objectId=${encodeURIComponent(adAcc.id)}&level=campaign&since=${encodeURIComponent(windowInfo.since)}&until=${encodeURIComponent(windowInfo.until)}&fields=campaign_id,campaign_name,impressions,clicks,spend,actions`;
        if (afterCursor) path += `&after=${encodeURIComponent(afterCursor)}`;

        try {
          const resp = await zernioGetWithRetry(apiKey, path, { maxRetries: 3, timeoutMs: 10000 });
          accountOk = true;
          const rows = Array.isArray(resp?.insights) ? resp.insights : (Array.isArray(resp?.data) ? resp.data : []);

          for (const row of rows) {
            const cid = String(row.campaign_id || row.campaignId || '');
            if (!cid) continue;
            const grainKey = `${adAcc.id}::${cid}::${windowInfo.since}::${windowInfo.until}::campaign`;
            const spend = Math.round(Number(row.spend || 0) * 100) / 100;
            const impressions = Number(row.impressions || 0);
            const clicks = Number(row.clicks || 0);
            const actions = Array.isArray(row.actions) ? row.actions : [];
            const onsiteLead = extractActionCount(actions, ['onsite_conversion.lead']);
            const genericLead = extractActionCount(actions, ['lead']);
            const webLead = extractActionCount(actions, ['onsite_web_lead']);
            const platformLeads = Math.max(onsiteLead, genericLead) + (onsiteLead === 0 && genericLead === 0 ? webLead : 0);
            const messagingConnections = extractActionCount(actions, ['onsite_conversion.total_messaging_connection', 'onsite_conversion.messaging_conversation_started_7d']);

            // Upsert by exact grain key — NEVER double-add duplicate rows for the same campaign/window!
            campaignsByGrain.set(grainKey, {
              id: cid,
              campaignId: cid,
              grainKey,
              name: row.campaign_name || row.campaignName || `Campaign ${cid}`,
              adAccountId: adAcc.id,
              adAccountName: adAcc.name,
              pageId: adAcc.primaryPageId,
              pageName: adAcc.primaryPageName,
              linkedPageIds: adAcc.linkedPageIds,
              currency: 'NZD',
              status: spend > 0 ? 'ACTIVE' : 'PAUSED',
              spend,
              impressions,
              clicks,
              platformLeads,
              messagingConnections,
              crmLeadsCount: 0,
              crmWonCount: 0,
              ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
              cplPlatform: platformLeads > 0 ? Math.round((spend / platformLeads) * 100) / 100 : null,
              cplCrm: null,
              dateSince: windowInfo.since,
              dateUntil: windowInfo.until,
              rawActions: actions
            });
          }

          const nextAfter = resp?.paging?.cursors?.after || resp?.paging?.after || null;
          if (!nextAfter || rows.length === 0) break;
          afterCursor = nextAfter;
        } catch (err) {
          errors.push({ scope: 'insights', adAccountId: adAcc.id, adAccountName: adAcc.name, error: err.message });
          break;
        }
      }

      if (accountOk) insightsSuccessCount++;
    });

    const campaignsById = new Map();
    for (const c of campaignsByGrain.values()) {
      campaignsById.set(c.campaignId, c);
    }

    // 3. Cross-link captured CRM leads to campaigns by campaign_id
    let crmLeads = Array.from((global.CRM_INGESTED_LEADS || new Map()).values());
    if (supabase) {
      try {
        const { data: dbLeads } = await supabase
          .from('leads')
          .select('id, campaign_id, status, sale_value_nzd, deal_value, created_at')
          .gte('created_at', `${windowInfo.since}T00:00:00Z`);
        if (Array.isArray(dbLeads) && dbLeads.length > 0) crmLeads = dbLeads;
      } catch (e) {}
    }

    for (const l of crmLeads) {
      if (!l.campaign_id) continue;
      const cid = String(l.campaign_id);
      if (campaignsById.has(cid)) {
        const c = campaignsById.get(cid);
        c.crmLeadsCount++;
        if (l.status === 'Won' || l.status === 'Converted' || l.status === 'Sold') c.crmWonCount++;
        c.cplCrm = c.crmLeadsCount > 0 ? Math.round((c.spend / c.crmLeadsCount) * 100) / 100 : null;
      }
    }

    const fetchedCampaigns = Array.from(campaignsByGrain.values()).sort((a, b) => b.spend - a.spend);
    const syncedAt = new Date().toISOString();
    const hadAnyFailure = errors.length > 0;
    const insightsRetrievedSuccessfully = insightsSuccessCount > 0;
    // Preserve prior cached campaigns if this fetch failed completely (NEVER wipe records on provider error!)
    const usePreservedCache = !insightsRetrievedSuccessfully && Array.isArray(global.ZERNIO_ADS_SYNC_CACHE?.campaigns) && global.ZERNIO_ADS_SYNC_CACHE.campaigns.length > 0;
    const campaigns = usePreservedCache ? global.ZERNIO_ADS_SYNC_CACHE.campaigns : fetchedCampaigns;

    const totalSpendNzd = Math.round(campaigns.reduce((s, c) => s + c.spend, 0) * 100) / 100;
    const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    const totalPlatformLeads = campaigns.reduce((s, c) => s + c.platformLeads, 0);
    const totalCrmLeads = campaigns.reduce((s, c) => s + c.crmLeadsCount, 0);
    const totalMessagingConnections = campaigns.reduce((s, c) => s + c.messagingConnections, 0);

    // Compute per-account spend, impressions, clicks, leads, and CPL from campaign-level insights
    for (const acc of allAdAccounts) {
      const accCampaigns = campaigns.filter(c => String(c.adAccountId) === String(acc.id));
      const accSpend = Math.round(accCampaigns.reduce((sum, c) => sum + Number(c.spend || 0), 0) * 100) / 100;
      const accImpressions = accCampaigns.reduce((sum, c) => sum + Number(c.impressions || 0), 0);
      const accClicks = accCampaigns.reduce((sum, c) => sum + Number(c.clicks || 0), 0);
      const accLeads = accCampaigns.reduce((sum, c) => sum + Number(c.platformLeads || 0), 0);
      const accCrmLeads = accCampaigns.reduce((sum, c) => sum + Number(c.crmLeadsCount || 0), 0);
      const accActiveCount = accCampaigns.filter(c => c.status === 'ACTIVE' || c.spend > 0).length;

      acc.spend = accSpend;
      acc.impressions = accImpressions;
      acc.clicks = accClicks;
      acc.platformLeads = accLeads;
      acc.crmLeadsCount = accCrmLeads;
      acc.activeCampaignsCount = accActiveCount;
      acc.totalCampaignsCount = accCampaigns.length;
      acc.cplPlatform = accLeads > 0 ? Math.round((accSpend / accLeads) * 100) / 100 : null;
      acc.cplCrm = accCrmLeads > 0 ? Math.round((accSpend / accCrmLeads) * 100) / 100 : null;
      acc.ctr = accImpressions > 0 ? Math.round((accClicks / accImpressions) * 10000) / 100 : 0;
    }

    // 4. Persist to Supabase tables if migrated (best-effort additive upsert on exact grain)
    if (supabase && insightsRetrievedSuccessfully) {
      for (const adAcc of allAdAccounts) {
        try {
          await safeDbUpsert(supabase, 'ad_accounts', {
            id: adAcc.id,
            provider: 'zernio',
            zernio_account_id: adAcc.zernioAccountId,
            page_id: adAcc.primaryPageId,
            name: adAcc.name,
            currency: adAcc.currency,
            account_status: String(adAcc.status),
            is_nzd: adAcc.isNzd,
            last_synced_at: syncedAt,
            updated_at: syncedAt
          }, 'id');
        } catch (e) {}
      }
      for (const c of fetchedCampaigns) {
        try {
          await safeDbUpsert(supabase, 'campaigns', {
            id: c.id,
            ad_account_id: c.adAccountId,
            page_id: c.pageId,
            name: c.name,
            status: c.status,
            currency: 'NZD',
            spend: c.spend,
            impressions: c.impressions,
            clicks: c.clicks,
            platform_leads: c.platformLeads,
            messaging_connections: c.messagingConnections,
            date_since: windowInfo.since,
            date_until: windowInfo.until,
            last_synced_at: syncedAt,
            updated_at: syncedAt
          }, 'id');
          await safeDbUpsert(supabase, 'ad_insights', {
            ad_account_id: c.adAccountId,
            campaign_id: c.id,
            campaign_name: c.name,
            page_id: c.pageId,
            date_since: windowInfo.since,
            date_until: windowInfo.until,
            currency: 'NZD',
            spend: c.spend,
            impressions: c.impressions,
            clicks: c.clicks,
            platform_leads: c.platformLeads,
            messaging_connections: c.messagingConnections,
            raw_actions: c.rawActions,
            synced_at: syncedAt
          }, 'ad_account_id,campaign_id,date_since,date_until');
        } catch (e) {}
      }
    }

    const syncStatus = !insightsRetrievedSuccessfully
      ? (nzdAdAccounts.length === 0 ? 'no_nzd_ad_accounts' : 'error')
      : (hadAnyFailure ? 'partial_success' : 'success');

    const result = {
      status: syncStatus,
      partialFailure: hadAnyFailure,
      stale: usePreservedCache,
      provider: 'zernio',
      currency: 'NZD',
      window: windowInfo,
      reportingMetadata: {
        timezone: 'Pacific/Auckland',
        attributionWindow: 'Meta account default (typically 7-day click / 1-day view)',
        grain: 'ad_account_id + campaign_id + date_since + date_until (campaign level)',
        currencyPolicy: 'NZD totals include NZD ad accounts only; non-NZD accounts remain visible with native currency labels and are never converted or mixed.'
      },
      durationMs: Date.now() - tStart,
      lastSuccessfulSync: (insightsRetrievedSuccessfully && !hadAnyFailure) ? syncedAt : (insightsRetrievedSuccessfully ? syncedAt : global.ZERNIO_ADS_SYNC_CACHE.lastSuccessfulSync),
      lastAttemptedSync: syncedAt,
      insightsRetrievedSuccessfully,
      allAdAccounts,
      adAccounts: nzdAdAccounts,
      excludedNonNzdAccounts,
      campaigns,
      totals: {
        spendNzd: totalSpendNzd,
        impressions: totalImpressions,
        clicks: totalClicks,
        ctr: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
        platformLeads: totalPlatformLeads,
        crmAttributedLeads: totalCrmLeads,
        messagingConnections: totalMessagingConnections,
        cplPlatformNzd: totalPlatformLeads > 0 ? Math.round((totalSpendNzd / totalPlatformLeads) * 100) / 100 : null,
        cplCrmNzd: totalCrmLeads > 0 ? Math.round((totalSpendNzd / totalCrmLeads) * 100) / 100 : null
      },
      providerLimitations: [
        'Zernio GET /api/v1/ads/campaigns only returns campaigns created inside Zernio; native Meta Ads Manager campaigns are retrieved via GET /api/v1/ads/insights?level=campaign.',
        excludedNonNzdAccounts.length > 0
          ? `${excludedNonNzdAccounts.length} non-NZD ad account(s) (${excludedNonNzdAccounts.map(a => `${a.name} [${a.currency}]`).join(', ')}) are listed separately and excluded from NZD totals.`
          : null
      ].filter(Boolean),
      errors: errors.length > 0 ? errors : undefined,
      timestamp: syncedAt
    };

    if (insightsRetrievedSuccessfully || allAdAccounts.length > 0) {
      global.ZERNIO_ADS_SYNC_CACHE = {
        lastSuccessfulSync: result.lastSuccessfulSync,
        lastAttemptedSync: syncedAt,
        insightsRetrievedSuccessfully: insightsRetrievedSuccessfully || global.ZERNIO_ADS_SYNC_CACHE.insightsRetrievedSuccessfully,
        partialFailure: hadAnyFailure,
        lastWindow: windowInfo,
        allAdAccounts: allAdAccounts.length > 0 ? allAdAccounts : global.ZERNIO_ADS_SYNC_CACHE.allAdAccounts,
        adAccounts: nzdAdAccounts.length > 0 ? nzdAdAccounts : global.ZERNIO_ADS_SYNC_CACHE.adAccounts,
        excludedNonNzdAccounts: allAdAccounts.length > 0 ? excludedNonNzdAccounts : global.ZERNIO_ADS_SYNC_CACHE.excludedNonNzdAccounts,
        campaigns,
        totals: result.totals,
        errors
      };
    }

    return result;
  });
}

/**
 * Fetches live Meta Lead Forms via Zernio /api/v1/ads/lead-forms across all connected pages.
 */
async function fetchZernioLeadForms({ apiKey, pageId = null } = {}) {
  const cache = await getDynamicZernioAccounts(apiKey, { forceRefresh: false });
  const targetAccounts = pageId && pageId !== 'all'
    ? cache.accounts.filter(a => a.pageId === String(pageId) || a.accountId === String(pageId))
    : cache.accounts;

  const forms = [];
  const errors = [];

  await Promise.all(targetAccounts.map(async (acc) => {
    try {
      const resp = await zernioGetWithRetry(apiKey, `/api/v1/ads/lead-forms?accountId=${encodeURIComponent(acc.accountId)}`, { maxRetries: 2, timeoutMs: 8000 });
      const list = Array.isArray(resp?.forms) ? resp.forms : (Array.isArray(resp?.data) ? resp.data : []);
      for (const f of list) {
        forms.push({
          id: String(f.id || f.formId || ''),
          name: f.name || 'Unnamed Lead Form',
          status: f.status || 'ACTIVE',
          leadsCount: Number(f.leadsCount ?? f.leads_count ?? 0),
          createdTime: f.createdTime || f.created_time || null,
          accountId: acc.accountId,
          pageId: acc.pageId,
          pageName: acc.pageName,
          platform: acc.platform
        });
      }
    } catch (err) {
      errors.push({ accountId: acc.accountId, pageName: acc.pageName, error: err.message });
    }
  }));

  global.ZERNIO_LEADS_SYNC_CACHE.forms = forms;
  return { forms, errors, timestamp: new Date().toISOString() };
}

/**
 * Syncs real Meta Lead Ad submissions from Zernio GET /api/v1/ads/leads?accountId=...
 * and ingests every lead idempotently via ingestLeadAdEvent().
 */
async function syncZernioLeads({ apiKey, supabase = null, pageId = null, limitPerAccount = 50, skipDbWrite = false } = {}) {
  const cache = await getDynamicZernioAccounts(apiKey, { forceRefresh: true });
  const targetAccounts = pageId && pageId !== 'all'
    ? cache.accounts.filter(a => a.pageId === String(pageId) || a.accountId === String(pageId))
    : cache.accounts;

  let newLeads = 0;
  let skippedLeads = 0;
  let totalFetched = 0;
  const ingestedSample = [];
  const errors = [];
  let latestLeadAt = global.ZERNIO_LEADS_SYNC_CACHE.lastLeadReceivedAt;

  for (const acc of targetAccounts) {
    try {
      const resp = await zernioGetWithRetry(
        apiKey,
        `/api/v1/ads/leads?accountId=${encodeURIComponent(acc.accountId)}&limit=${encodeURIComponent(limitPerAccount)}`,
        { maxRetries: 2, timeoutMs: 9000 }
      );
      const rawLeads = Array.isArray(resp?.leads) ? resp.leads : (Array.isArray(resp?.data) ? resp.data : []);
      totalFetched += rawLeads.length;

      for (const item of rawLeads) {
        if (!item) continue;
        const createdAt = item.createdTime || item.created_time || item.createdAt || null;
        if (createdAt && (!latestLeadAt || new Date(createdAt) > new Date(latestLeadAt))) {
          latestLeadAt = new Date(createdAt).toISOString();
        }
        const enriched = {
          ...item,
          page_id: acc.pageId,
          page_name: acc.pageName,
          accountId: acc.accountId,
          platform: item.platform || acc.platform || 'facebook'
        };
        const res = await ingestLeadAdEvent(supabase, enriched, {
          provider: 'zernio_leads_sync',
          skipDbWrite
        });
        if (res.isDuplicate) skippedLeads++;
        else {
          newLeads++;
          if (ingestedSample.length < 10) ingestedSample.push(res.lead);
        }
      }
    } catch (err) {
      errors.push({ accountId: acc.accountId, pageName: acc.pageName, error: err.message });
    }
  }

  const syncedAt = new Date().toISOString();
  global.ZERNIO_LEADS_SYNC_CACHE.lastSuccessfulSync = syncedAt;
  global.ZERNIO_LEADS_SYNC_CACHE.recentLeadCount = Math.max(global.ZERNIO_LEADS_SYNC_CACHE.recentLeadCount, totalFetched);
  if (latestLeadAt) global.ZERNIO_LEADS_SYNC_CACHE.lastLeadReceivedAt = latestLeadAt;

  return {
    status: 'success',
    provider: 'zernio',
    syncedCount: newLeads,
    newLeads,
    skippedLeads,
    totalFetched,
    totalProcessed: newLeads + skippedLeads,
    connectedPagesProcessed: targetAccounts.length,
    lastLeadReceivedAt: latestLeadAt,
    sampleLeads: ingestedSample,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: syncedAt
  };
}

/**
 * Honest Multi-Stage Connection Health Inspector.
 * Never infers readiness from HTTP 200 or OAuth scope alone.
 * Separates:
 * - accountConnected
 * - permissionsVerified (messaging, leadsRetrieval, adsRead)
 * - subscriptionVerified (page leadgenSubscribed + active Zernio webhook pointing to current CRM domain)
 * - leadReceivedSuccessfully
 * - adAccountConnected
 * - insightsRetrievedSuccessfully
 * - lastSuccessfulSync
 */
async function inspectZernioHealth({ apiKey, supabase = null, currentHost = 'crm-mu-three-52.vercel.app' } = {}) {
  const hasWebhookSecret = Boolean(process.env.ZERNIO_WEBHOOK_SECRET);
  const expectedWebhookUrl = `https://${String(currentHost).replace(/^https?:\/\//, '').replace(/\/.*$/, '')}/api/webhooks/zernio`;

  if (!apiKey) {
    return {
      status: 'not_configured',
      gatewayConfigured: false,
      webhookSignatureEnforced: hasWebhookSecret,
      webhookHealth: {
        status: 'not_configured',
        active: false,
        matchesCurrentDomain: false,
        secretConfigured: hasWebhookSecret,
        expectedUrl: expectedWebhookUrl,
        configuredWebhooks: [],
        actionRequired: 'Configure ZERNIO_API_KEY and ZERNIO_WEBHOOK_SECRET in environment variables.'
      },
      pages: [],
      timestamp: new Date().toISOString()
    };
  }

  let liveAccountsError = null;
  let accounts = [];
  try {
    const cache = await getDynamicZernioAccounts(apiKey, { forceRefresh: true });
    accounts = cache.accounts;
  } catch (err) {
    liveAccountsError = err.message;
  }

  // Probe Zernio webhook settings live (read-only)
  let webhookSettings = [];
  let webhookProbeError = null;
  try {
    const whResp = await zernioGetWithRetry(apiKey, '/api/v1/webhooks/settings', { maxRetries: 2, timeoutMs: 6000 });
    webhookSettings = Array.isArray(whResp?.webhooks) ? whResp.webhooks : (Array.isArray(whResp?.data) ? whResp.data : []);
  } catch (err) {
    webhookProbeError = err.message;
  }

  const sanitizedWebhooks = webhookSettings.map(w => ({
    id: w._id || w.id,
    name: w.name || 'Webhook',
    url: w.url || '',
    isActive: Boolean(w.isActive),
    hasSecret: Boolean(w.secret),
    events: Array.isArray(w.events) ? w.events : [],
    failureCount: Number(w.failureCount || 0),
    disabledReason: w.disabledReason || null,
    lastFailureAt: w.lastFailureAt || null
  }));

  const activeMatchingLeadWebhook = sanitizedWebhooks.find(w =>
    w.isActive &&
    w.events.includes('lead.received') &&
    w.url.toLowerCase().includes(String(currentHost).toLowerCase().split(':')[0])
  );
  const activeMatchingMsgWebhook = sanitizedWebhooks.find(w =>
    w.isActive &&
    w.events.includes('message.received') &&
    w.url.toLowerCase().includes(String(currentHost).toLowerCase().split(':')[0])
  );

  let webhookActionRequired = null;
  let webhookStatus = 'active';
  if (webhookProbeError) {
    webhookStatus = 'probe_error';
    webhookActionRequired = `Could not inspect Zernio webhooks (${webhookProbeError}).`;
  } else if (sanitizedWebhooks.length === 0) {
    webhookStatus = 'missing';
    webhookActionRequired = `No webhook configured in Zernio. Create an active webhook pointing to ${expectedWebhookUrl} with lead.received and message.received.`;
  } else if (!activeMatchingLeadWebhook) {
    const anyDisabled = sanitizedWebhooks.some(w => !w.isActive);
    const wrongDomain = sanitizedWebhooks.some(w => w.url && !w.url.toLowerCase().includes(String(currentHost).toLowerCase().split(':')[0]));
    webhookStatus = anyDisabled ? 'disabled' : (wrongDomain ? 'wrong_domain' : 'inactive');
    webhookActionRequired = `Live Zernio webhook is ${anyDisabled ? 'DISABLED' : 'not targeting this deployment'} (${sanitizedWebhooks.map(w => `${w.url} [active=${w.isActive}, failures=${w.failureCount}${w.disabledReason ? ', ' + w.disabledReason : ''}]`).join('; ')}). Update Zernio webhook URL to ${expectedWebhookUrl}, set matching secret, and re-enable after deployment.`;
  } else if (!hasWebhookSecret || !activeMatchingLeadWebhook.hasSecret) {
    webhookStatus = 'unsigned';
    webhookActionRequired = 'Webhook is active, but HMAC signing secret is missing on CRM or Zernio.';
  }

  // Probe per-page ad accounts, lead forms, and recent leads in bounded parallel (read-only)
  const pagesHealth = await Promise.all(accounts.map(async (acc) => {
    const perms = acc.permissions || [];
    const hasMessagingPerm = perms.includes('pages_messaging') || perms.includes('instagram_manage_messages');
    const hasLeadsPerm = perms.includes('leads_retrieval');
    const hasAdsPerm = perms.includes('ads_read') || perms.includes('ads_management');
    const tokenExpired = acc.tokenExpiresAt ? (new Date(acc.tokenExpiresAt) < new Date()) : false;
    const needsReconnection = Boolean(acc.needsReconnection || tokenExpired || !acc.isActive);
    const accountConnected = Boolean(acc.isActive && !needsReconnection);

    let adAccounts = [];
    let leadFormsCount = 0;
    let recentLeadsCount = 0;
    let lastLeadAt = null;
    let probeNotes = [];

    if (accountConnected) {
      const [adRes, formRes, leadRes] = await Promise.all([
        zernioGet(apiKey, `/api/v1/ads/accounts?accountId=${encodeURIComponent(acc.accountId)}`, 5000).catch(e => ({ _err: e.message })),
        zernioGet(apiKey, `/api/v1/ads/lead-forms?accountId=${encodeURIComponent(acc.accountId)}`, 5000).catch(e => ({ _err: e.message })),
        zernioGet(apiKey, `/api/v1/ads/leads?accountId=${encodeURIComponent(acc.accountId)}&limit=1`, 5000).catch(e => ({ _err: e.message }))
      ]);
      const rawAdAccList = Array.isArray(adRes?.accounts) ? adRes.accounts : (Array.isArray(adRes?.adAccounts) ? adRes.adAccounts : []);
      if (rawAdAccList.length > 0) {
        adAccounts = rawAdAccList.map(a => ({
          id: a.id,
          name: a.name,
          currency: a.currency,
          billingStatus: a.billingStatus || null,
          isNzd: String(a.currency || '').toUpperCase() === 'NZD'
        }));
      } else if (adRes?._err) {
        probeNotes.push(`Ad accounts probe: ${adRes._err}`);
      }
      if (Array.isArray(formRes?.forms)) {
        leadFormsCount = formRes.forms.length;
      }
      const fetchedLeads = Array.isArray(leadRes?.leads) ? leadRes.leads : [];
      recentLeadsCount = Number(leadRes?.total ?? fetchedLeads.length ?? 0);
      if (fetchedLeads[0]) {
        lastLeadAt = fetchedLeads[0].createdTime || fetchedLeads[0].created_time || null;
      }
    }

    const nzdAdAccounts = adAccounts.filter(a => a.isNzd);
    const adAccountConnected = nzdAdAccounts.length > 0;
    const cachedInsightsForPage = global.ZERNIO_ADS_SYNC_CACHE.insightsRetrievedSuccessfully &&
      global.ZERNIO_ADS_SYNC_CACHE.adAccounts.some(a => a.linkedPageIds?.includes(acc.pageId) || a.primaryPageId === acc.pageId);

    const permissionsVerified = {
      messaging: hasMessagingPerm,
      leadsRetrieval: hasLeadsPerm,
      adsRead: hasAdsPerm,
      allCoreGranted: Boolean(hasMessagingPerm && (acc.platform !== 'facebook' || hasLeadsPerm) && hasAdsPerm)
    };

    const subscriptionVerified = {
      pageLeadgenSubscribed: Boolean(acc.leadgenSubscribed),
      webhookActiveForLeadReceived: Boolean(activeMatchingLeadWebhook),
      webhookActiveForMessaging: Boolean(activeMatchingMsgWebhook),
      verified: Boolean(acc.leadgenSubscribed && activeMatchingLeadWebhook)
    };

    const leadReceivedSuccessfully = Boolean(recentLeadsCount > 0 || lastLeadAt);

    const missingPermissions = [];
    if (!hasMessagingPerm) missingPermissions.push(acc.platform === 'instagram' ? 'instagram_manage_messages' : 'pages_messaging');
    if (acc.platform === 'facebook' && !hasLeadsPerm) missingPermissions.push('leads_retrieval');
    if (!hasAdsPerm) missingPermissions.push('ads_read');

    let actionRequired = null;
    if (needsReconnection) actionRequired = 'Token expired or disconnected — click Reconnect.';
    else if (!acc.leadgenSubscribed && acc.platform === 'facebook') actionRequired = 'Leadgen subscription inactive on page — reconnect with leads_retrieval permission.';
    else if (!activeMatchingLeadWebhook) actionRequired = 'Page is subscribed, but Zernio webhook delivery to this CRM is disabled/misconfigured.';
    else if (!adAccountConnected) actionRequired = 'No NZD Meta Ad Account linked to this page.';
    else if (!cachedInsightsForPage) actionRequired = 'Ad account linked — run "Sync Ad Insights" to retrieve campaign spend & CPL.';

    return {
      accountId: acc.accountId,
      pageId: acc.pageId,
      pageName: acc.pageName,
      platform: acc.platform,
      // Strict separated readiness signals (NEVER inferred from HTTP 200 alone)
      accountConnected,
      oauthConnected: accountConnected,
      permissionsVerified,
      subscriptionVerified,
      leadgenSubscribed: Boolean(acc.leadgenSubscribed),
      leadFormsCount,
      leadReceivedSuccessfully,
      recentLeadsCount,
      lastLeadReceivedAt: lastLeadAt,
      adAccountConnected,
      adAccounts,
      insightsRetrievedSuccessfully: Boolean(cachedInsightsForPage),
      lastSuccessfulSync: global.ZERNIO_ADS_SYNC_CACHE.lastSuccessfulSync || global.ZERNIO_LEADS_SYNC_CACHE.lastSuccessfulSync || null,
      // Derived honest capability summary flags
      messagingReady: Boolean(accountConnected && hasMessagingPerm && acc.messagingSubscribed),
      leadAdsReady: Boolean(accountConnected && hasLeadsPerm && subscriptionVerified.verified),
      adReportingReady: Boolean(accountConnected && hasAdsPerm && adAccountConnected && cachedInsightsForPage),
      needsReconnection,
      tokenExpiresAt: acc.tokenExpiresAt,
      missingPermissions,
      probeNotes: probeNotes.length > 0 ? probeNotes : undefined,
      actionRequired
    };
  }));

  return {
    status: liveAccountsError ? 'degraded' : (webhookStatus === 'active' ? 'ok' : 'attention_required'),
    gatewayConfigured: true,
    webhookSignatureEnforced: hasWebhookSecret,
    liveAccountsError,
    webhookHealth: {
      status: webhookStatus,
      active: Boolean(activeMatchingLeadWebhook),
      messagingActive: Boolean(activeMatchingMsgWebhook),
      matchesCurrentDomain: Boolean(activeMatchingLeadWebhook),
      secretConfigured: hasWebhookSecret,
      expectedUrl: expectedWebhookUrl,
      configuredWebhooks: sanitizedWebhooks,
      actionRequired: webhookActionRequired
    },
    adsSyncState: {
      insightsRetrievedSuccessfully: global.ZERNIO_ADS_SYNC_CACHE.insightsRetrievedSuccessfully,
      lastSuccessfulSync: global.ZERNIO_ADS_SYNC_CACHE.lastSuccessfulSync,
      nzdAdAccountsCount: global.ZERNIO_ADS_SYNC_CACHE.adAccounts.length,
      excludedNonNzdCount: global.ZERNIO_ADS_SYNC_CACHE.excludedNonNzdAccounts.length,
      campaignsSyncedCount: global.ZERNIO_ADS_SYNC_CACHE.campaigns.length
    },
    leadsSyncState: {
      lastSuccessfulSync: global.ZERNIO_LEADS_SYNC_CACHE.lastSuccessfulSync,
      lastLeadReceivedAt: global.ZERNIO_LEADS_SYNC_CACHE.lastLeadReceivedAt
    },
    pages: pagesHealth,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  zernioGet,
  zernioGetWithRetry,
  mapWithBoundedConcurrency,
  getDynamicZernioAccounts,
  resolveDynamicAccount,
  resolveDateWindow,
  syncZernioAdsInsights,
  fetchZernioLeadForms,
  syncZernioLeads,
  inspectZernioHealth
};
