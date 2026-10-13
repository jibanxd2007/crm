const { createClient } = require('@supabase/supabase-js');
const { resolveUser, createVercelHandler } = require('./_utils/index.js');

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// Computes exact date boundaries in IST (UTC+5:30)
function getISTDateRange(rangeType, customStart, customEnd) {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);

  const y = istNow.getFullYear();
  const m = String(istNow.getMonth() + 1).padStart(2, '0');
  const d = String(istNow.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;

  let startDateStr = todayStr;
  let endDateStr = todayStr;

  if (rangeType === 'yesterday') {
    const yDate = new Date(istNow);
    yDate.setDate(yDate.getDate() - 1);
    const yy = yDate.getFullYear();
    const ym = String(yDate.getMonth() + 1).padStart(2, '0');
    const yd = String(yDate.getDate()).padStart(2, '0');
    startDateStr = `${yy}-${ym}-${yd}`;
    endDateStr = startDateStr;
  } else if (rangeType === 'last_7d' || rangeType === 'last_7_days' || rangeType === '7d') {
    const past = new Date(istNow);
    past.setDate(past.getDate() - 6);
    const py = past.getFullYear();
    const pm = String(past.getMonth() + 1).padStart(2, '0');
    const pd = String(past.getDate()).padStart(2, '0');
    startDateStr = `${py}-${pm}-${pd}`;
    endDateStr = todayStr;
  } else if (rangeType === 'this_month' || rangeType === 'month') {
    startDateStr = `${y}-${m}-01`;
    endDateStr = todayStr;
  } else if (rangeType === 'last_30d' || rangeType === '30d') {
    const past = new Date(istNow);
    past.setDate(past.getDate() - 29);
    const py = past.getFullYear();
    const pm = String(past.getMonth() + 1).padStart(2, '0');
    const pd = String(past.getDate()).padStart(2, '0');
    startDateStr = `${py}-${pm}-${pd}`;
    endDateStr = todayStr;
  } else if (rangeType === 'custom' && customStart) {
    startDateStr = customStart;
    endDateStr = customEnd || todayStr;
  }

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    startIso: `${startDateStr}T00:00:00.000+05:30`,
    endIso: `${endDateStr}T23:59:59.999+05:30`
  };
}

async function reportsHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, X-User-Id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Authentication Check
  const user = resolveUser(req.headers);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Authentication required" });
  }

  const requestedPage = req.query?.page_id || req.query?.pageId;
  const dateRangeType = (req.query?.date_range || req.query?.dateRange || 'last_7d').toLowerCase();
  const customStart = req.query?.start_date || req.query?.startDate;
  const customEnd = req.query?.end_date || req.query?.endDate;

  // 2. Authorization Check for Page Scoping
  if (requestedPage && user.role !== 'admin' && !user.pages.includes('*')) {
    if (!user.pages.includes(requestedPage)) {
      return res.status(403).json({
        error: "Forbidden: Access denied to reports for unassigned page",
        requestedPage: requestedPage
      });
    }
  }

  const dateBounds = getISTDateRange(dateRangeType, customStart, customEnd);
  const supabase = getSupabaseAdmin();

  try {
    let tokenExpired = false;
    let tokenExpiryReason = null;

    if (supabase) {
      // Check Meta token validity in meta_connections
      const { data: conn } = await supabase
        .from('meta_connections')
        .select('*')
        .maybeSingle();

      if (conn) {
        if (conn.is_active === false || (conn.last_error && conn.last_error.toLowerCase().includes('token'))) {
          tokenExpired = true;
          tokenExpiryReason = conn.last_error || 'Meta token is inactive or revoked';
        } else if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
          tokenExpired = true;
          tokenExpiryReason = 'Meta access token has expired';
        }
      }
    }

    let leads = [];
    let conversations = [];
    let insights = [];
    let pagesList = [];
    let campaignsList = [];

    if (supabase) {
      // 1. Fetch Pages (scoped by user access)
      let pagesQuery = supabase.from('facebook_pages').select('id, name, page_id');
      if (user.role !== 'admin' && !user.pages.includes('*')) {
        pagesQuery = pagesQuery.in('id', user.pages);
      } else if (requestedPage) {
        pagesQuery = pagesQuery.eq('id', requestedPage);
      }
      const { data: pagesData } = await pagesQuery;
      pagesList = pagesData || [];

      // Also fallback to meta_pages if facebook_pages has none
      if (pagesList.length === 0) {
        let metaPagesQuery = supabase.from('meta_pages').select('id, name, meta_page_id');
        if (user.role !== 'admin' && !user.pages.includes('*')) {
          metaPagesQuery = metaPagesQuery.in('id', user.pages);
        } else if (requestedPage) {
          metaPagesQuery = metaPagesQuery.eq('id', requestedPage);
        }
        const { data: mpData } = await metaPagesQuery;
        if (mpData) pagesList = mpData;
      }

      // 2. Fetch Leads in IST Date Range
      let leadsQuery = supabase
        .from('leads')
        .select('id, full_name, name, page_id, campaign_id, campaign_name, status, source, lead_value, created_at')
        .gte('created_at', dateBounds.startIso)
        .lte('created_at', dateBounds.endIso);

      if (user.role !== 'admin' && !user.pages.includes('*')) {
        leadsQuery = leadsQuery.in('page_id', user.pages);
      } else if (requestedPage) {
        leadsQuery = leadsQuery.eq('page_id', requestedPage);
      }
      const { data: leadsData } = await leadsQuery;
      leads = leadsData || [];

      // 3. Fetch Conversations in IST Date Range
      let convsQuery = supabase
        .from('conversations')
        .select('id, page_id, last_message_at, unread_count, is_archived, created_at')
        .gte('last_message_at', dateBounds.startIso)
        .lte('last_message_at', dateBounds.endIso);

      if (user.role !== 'admin' && !user.pages.includes('*')) {
        convsQuery = convsQuery.in('page_id', user.pages);
      } else if (requestedPage) {
        convsQuery = convsQuery.eq('page_id', requestedPage);
      }
      const { data: convsData } = await convsQuery;
      conversations = convsData || [];

      // 4. Fetch Ad Insights in Date Range
      let insightsQuery = supabase
        .from('ad_insights')
        .select('*')
        .gte('date_start', dateBounds.startDate)
        .lte('date_start', dateBounds.endDate);

      if (user.role !== 'admin' && !user.pages.includes('*')) {
        insightsQuery = insightsQuery.in('page_id', user.pages);
      } else if (requestedPage) {
        insightsQuery = insightsQuery.eq('page_id', requestedPage);
      }
      const { data: insData } = await insightsQuery;
      insights = insData || [];

      // 5. Fetch Campaigns
      let campsQuery = supabase.from('campaigns').select('*');
      if (user.role !== 'admin' && !user.pages.includes('*')) {
        campsQuery = campsQuery.in('page_id', user.pages);
      } else if (requestedPage) {
        campsQuery = campsQuery.eq('page_id', requestedPage);
      }
      const { data: campsData } = await campsQuery;
      campaignsList = campsData || [];
    }

    // Aggregate summary metrics
    let totalSpend = 0;
    if (insights.length > 0) {
      insights.forEach(ins => {
        totalSpend += parseFloat(ins.spend || 0);
      });
    } else if (campaignsList.length > 0) {
      campaignsList.forEach(c => {
        totalSpend += parseFloat(c.total_spend || c.spend || 0);
      });
    }

    const totalLeads = leads.length;
    const wonLeads = leads.filter(l => l.status === 'Won' || l.status === 'won' || l.status === 'Converted');
    const totalWon = wonLeads.length;
    const totalWonValue = wonLeads.reduce((sum, l) => sum + (parseFloat(l.lead_value || 25000)), 0);
    const totalConversations = conversations.length;
    const cpl = totalLeads > 0 ? (totalSpend / totalLeads) : 0;
    const roas = totalSpend > 0 ? (totalWonValue / totalSpend) : 0;

    // Build Page Breakdown
    const pageMap = new Map();
    pagesList.forEach(p => {
      pageMap.set(String(p.id), {
        pageId: p.id,
        pageName: p.name || 'Facebook Page',
        leads: 0,
        spend: 0,
        cpl: 0,
        conversations: 0,
        dealsWon: 0
      });
    });

    // Populate page leads & won
    leads.forEach(l => {
      const pid = String(l.page_id || 'unknown');
      if (!pageMap.has(pid)) {
        pageMap.set(pid, {
          pageId: pid,
          pageName: 'Page ' + pid.substring(0, 8),
          leads: 0,
          spend: 0,
          cpl: 0,
          conversations: 0,
          dealsWon: 0
        });
      }
      const pEntry = pageMap.get(pid);
      pEntry.leads++;
      if (l.status === 'Won' || l.status === 'won' || l.status === 'Converted') {
        pEntry.dealsWon++;
      }
    });

    // Populate page conversations
    conversations.forEach(c => {
      const pid = String(c.page_id || 'unknown');
      if (pageMap.has(pid)) {
        pageMap.get(pid).conversations++;
      }
    });

    // Populate page spend from insights
    insights.forEach(ins => {
      const pid = String(ins.page_id || 'unknown');
      if (pageMap.has(pid)) {
        pageMap.get(pid).spend += parseFloat(ins.spend || 0);
      }
    });

    // Compute CPL for each page
    const pageBreakdown = Array.from(pageMap.values()).map(p => ({
      ...p,
      spend: Math.round(p.spend * 100) / 100,
      cpl: p.leads > 0 ? Math.round((p.spend / p.leads) * 100) / 100 : 0
    }));

    // Build Campaign Breakdown
    const campMap = new Map();
    campaignsList.forEach(c => {
      campMap.set(String(c.meta_campaign_id || c.id), {
        campaignId: c.meta_campaign_id || c.id,
        campaignName: c.name || 'Campaign',
        pageId: c.page_id,
        pageName: pageMap.get(String(c.page_id))?.pageName || 'Connected Page',
        status: c.status || 'ACTIVE',
        spend: parseFloat(c.total_spend || c.spend || 0),
        leads: 0,
        cpl: 0,
        dealsWon: 0
      });
    });

    leads.forEach(l => {
      const cid = String(l.campaign_id || 'direct');
      if (!campMap.has(cid)) {
        campMap.set(cid, {
          campaignId: cid,
          campaignName: l.campaign_name || (cid === 'direct' ? 'Organic / Direct Messaging' : `Campaign ${cid}`),
          pageId: l.page_id,
          pageName: pageMap.get(String(l.page_id))?.pageName || 'Connected Page',
          status: 'ACTIVE',
          spend: 0,
          leads: 0,
          cpl: 0,
          dealsWon: 0
        });
      }
      const cEntry = campMap.get(cid);
      cEntry.leads++;
      if (l.status === 'Won' || l.status === 'won' || l.status === 'Converted') {
        cEntry.dealsWon++;
      }
    });

    // Reconcile spend from insights for campaigns
    insights.forEach(ins => {
      const cid = String(ins.campaign_id || '');
      if (cid && campMap.has(cid)) {
        campMap.get(cid).spend += parseFloat(ins.spend || 0);
      }
    });

    const campaignBreakdown = Array.from(campMap.values()).map(c => ({
      ...c,
      spend: Math.round(c.spend * 100) / 100,
      cpl: c.leads > 0 ? Math.round((c.spend / c.leads) * 100) / 100 : 0
    }));

    return res.status(200).json({
      status: 'success',
      tokenExpired,
      tokenExpiryReason,
      dateRange: dateRangeType,
      dateBounds: {
        startDate: dateBounds.startDate,
        endDate: dateBounds.endDate,
        timezone: 'Asia/Kolkata'
      },
      userRole: user.role,
      summary: {
        totalLeads,
        totalSpend: Math.round(totalSpend * 100) / 100,
        cpl: Math.round(cpl * 100) / 100,
        totalConversations,
        dealsWon: totalWon,
        totalWonValue,
        roas: Math.round(roas * 100) / 100,
        conversionRate: totalLeads > 0 ? ((totalWon / totalLeads) * 100).toFixed(1) + '%' : '0.0%'
      },
      pageBreakdown,
      campaignBreakdown,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Reports Handler Error]:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = createVercelHandler(reportsHandler);
