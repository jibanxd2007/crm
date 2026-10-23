/**
 * Production Meta Marketing API Campaigns, Insights & Assets Endpoint
 * 
 * Supports:
 * - GET/POST /api/meta/campaigns
 * - GET /api/meta/insights (?action=insights)
 * - GET/POST /api/meta/assets (?action=assets)
 */

const { MetaClient } = require('../_services/meta-client.js');
const { createClient } = require('@supabase/supabase-js');
const { createVercelHandler, httpsRequest } = require('../_utils/index.js');

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });
}

async function metaCampaignsUnifiedHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = req.query || {};
  const url = req.url || '';
  const action = (query.action || '').toLowerCase();
  const defaultOrgId = '00000000-0000-0000-0000-000000000001';

  const authHeader = req.headers.authorization || '';
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  const supabase = getSupabaseAdmin();

  // 1. Mandatory Authentication Check
  const { resolveUser } = require('../_utils/index.js');
  const user = resolveUser(req.headers);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Valid authentication required." });
  }

  // --------------------------------------------------------------------------
  // A. ASSETS MODE (/api/meta/assets)
  // --------------------------------------------------------------------------
  if (action === 'assets' || url.includes('/assets')) {
    if (req.method === 'GET') {
      try {
        if (supabase) {
          const [pagesRes, adAccRes, connRes] = await Promise.all([
            supabase.from('meta_pages').select('id, meta_page_id, name, username, category, avatar_url, tasks, is_connected, webhook_subscribed, ig_business_account_id, ig_username, followers_count, last_synced_at').eq('organization_id', defaultOrgId),
            supabase.from('ad_accounts').select('id, meta_ad_account_id, name, currency, timezone_name, account_status, amount_spent, business_name, is_connected').eq('organization_id', defaultOrgId),
            supabase.from('meta_connections').select('id, organization_id, meta_user_id, meta_user_name, meta_user_email, token_expires_at, scopes, is_active, last_error, last_synced_at').eq('organization_id', defaultOrgId).maybeSingle()
          ]);

          let pages = pagesRes.data || [];
          let adAccounts = adAccRes.data || [];

          if (pages.length === 0 && process.env.ZERNIO_API_KEY) {
            try {
              const zRes = await httpsRequest('https://zernio.com/api/v1/accounts', {
                headers: { 'Authorization': `Bearer ${process.env.ZERNIO_API_KEY}` }
              });
              const raw = (zRes && zRes.accounts) || [];
              pages = raw.map(a => ({
                id: a._id || a.id,
                meta_page_id: (a.metadata && a.metadata.selectedPageId) || a._id,
                name: a.displayName || a.username,
                username: a.username,
                is_connected: a.enabled !== false,
                followers_count: a.followersCount || 0
              }));
              adAccounts = raw.filter(a => a.adsStatus === 'connected').map(a => ({
                id: `act_${a._id || a.id}`,
                meta_ad_account_id: a._id || a.id,
                name: `${a.displayName || a.username} (Ad Account)`,
                currency: 'INR',
                is_connected: true
              }));
            } catch (zErr) {}
          }

          return res.status(200).json({
            connection: connRes.data || { is_active: true, meta_user_name: "Connected via Zernio Gateway" },
            pages: pages,
            adAccounts: adAccounts
          });
        }

        return res.status(200).json({
          connection: null,
          pages: [],
          adAccounts: []
        });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    if (req.method === 'POST') {
      const { asset_type, asset_id, is_connected } = req.body || {};
      if (supabase && asset_type && asset_id) {
        const table = asset_type === 'page' ? 'meta_pages' : 'ad_accounts';
        await supabase.from(table).update({ is_connected, updated_at: new Date().toISOString() }).eq('id', asset_id).catch(() => {});
      }
      return res.status(200).json({ success: true, asset_id, is_connected });
    }
  }

  // --------------------------------------------------------------------------
  // B. INSIGHTS MODE (/api/meta/insights)
  // --------------------------------------------------------------------------
  if (action === 'insights' || url.includes('/insights')) {
    const { ad_account_id, date_preset = 'last_30d', time_range } = query;
    if (!ad_account_id) {
      return res.status(400).json({ error: 'ad_account_id query parameter is required.' });
    }

    if (!token) {
      return res.status(500).json({ error: 'Meta Access Token not configured on the server.' });
    }

    try {
      const client = new MetaClient(token);
      const actId = ad_account_id.startsWith('act_') ? ad_account_id : `act_${ad_account_id}`;
      let timeParam = `date_preset=${date_preset}`;
      if (time_range) timeParam = `time_range=${encodeURIComponent(time_range)}`;

      const endpoint = `/${actId}/insights?fields=spend,impressions,reach,clicks,cpc,ctr,cpm,actions&${timeParam}&time_increment=1`;
      const data = await client.request(endpoint);
      const dayRows = data.data || [];

      let totalSpend = 0, totalImpressions = 0, totalReach = 0, totalClicks = 0, totalLeads = 0;
      const timeSeries = dayRows.map(row => {
        const spend = parseFloat(row.spend || 0);
        const impressions = parseInt(row.impressions || 0, 10);
        const reach = parseInt(row.reach || 0, 10);
        const clicks = parseInt(row.clicks || 0, 10);

        let leads = 0;
        if (Array.isArray(row.actions)) {
          const lAct = row.actions.find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
          if (lAct) leads = parseInt(lAct.value || 0, 10);
        }

        totalSpend += spend;
        totalImpressions += impressions;
        totalReach += reach;
        totalClicks += clicks;
        totalLeads += leads;

        return {
          date: row.date_start,
          spend,
          impressions,
          reach,
          clicks,
          leads,
          cost_per_lead: leads > 0 ? (spend / leads) : 0
        };
      });

      return res.status(200).json({
        ad_account_id: actId,
        date_preset,
        summary: {
          total_spend: totalSpend,
          impressions: totalImpressions,
          reach: totalReach,
          clicks: totalClicks,
          leads: totalLeads,
          cost_per_lead: totalLeads > 0 ? (totalSpend / totalLeads) : 0
        },
        timeSeries
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // C. ROI MODE (/api/meta/roi)
  // --------------------------------------------------------------------------
  if (action === 'roi' || url.includes('/roi')) {
    let records = [];
    if (supabase) {
      try {
        let insQuery = supabase.from('ad_insights').select('*');
        if (user.role !== 'admin' && !user.pages.includes('*')) {
          insQuery = insQuery.in('page_id', user.pages);
        }
        const { data: dbInsights } = await insQuery;
        if (Array.isArray(dbInsights) && dbInsights.length > 0) {
          records = dbInsights.map(r => ({
            pageId: r.page_id,
            campaignId: r.campaign_id,
            spend: parseFloat(r.spend || 0),
            leads: parseInt(r.leads || 0, 10),
            cpl: parseInt(r.leads || 0, 10) > 0 ? (parseFloat(r.spend || 0) / parseInt(r.leads || 0, 10)) : null
          }));
        }
      } catch (err) {
        console.warn("[ROI DB Fetch Warning]:", err.message);
      }
    }

    const totalSpend = records.reduce((sum, r) => sum + (r.spend || 0), 0);
    const totalLeads = records.reduce((sum, r) => sum + (r.leads || 0), 0);

    return res.status(200).json({
      status: "success",
      userRole: user.role,
      accessiblePages: user.pages,
      records: records,
      hasData: records.length > 0,
      summary: {
        totalSpend,
        totalLeads,
        cpl: totalLeads > 0 ? (totalSpend / totalLeads) : 0,
        cpa: 0,
        blendedCpl: totalLeads > 0 ? (totalSpend / totalLeads) : 0
      }
    });
  }

  // --------------------------------------------------------------------------
  // D. AD SETS & ADS DRILLDOWN MODES
  // --------------------------------------------------------------------------
  if (action === 'adsets' || url.includes('/adsets')) {
    const { ad_account_id = process.env.META_AD_ACCOUNT_ID || '', date_preset = 'last_30d', campaign_id } = query;
    if (!token) {
      return res.status(200).json({ status: "success", count: 0, adSets: [], message: "Meta token not configured" });
    }

    try {
      const client = new MetaClient(token);
      const data = await client.getAdSets(ad_account_id, date_preset);
      const rawSets = data.data || [];
      const filtered = campaign_id ? rawSets.filter(s => s.campaign_id === campaign_id) : rawSets;

      const adSets = filtered.map(s => {
        const ins = (s.insights && s.insights.data && s.insights.data[0]) || {};
        const spend = parseFloat(ins.spend || 0);
        const impressions = parseInt(ins.impressions || 0, 10);
        const clicks = parseInt(ins.clicks || 0, 10);
        const ctr = parseFloat(ins.ctr || 0);
        const cpc = parseFloat(ins.cpc || 0);
        const cpm = parseFloat(ins.cpm || 0);
        let leads = 0;
        if (Array.isArray(ins.actions)) {
          const lAct = ins.actions.find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
          if (lAct) leads = parseInt(lAct.value || 0, 10);
        }
        return {
          id: s.id,
          name: s.name,
          campaign_id: s.campaign_id,
          status: s.status,
          daily_budget: s.daily_budget ? (parseFloat(s.daily_budget) / 100) : 0,
          metrics: { spend, impressions, clicks, ctr, cpc, cpm, leads, cost_per_lead: leads > 0 ? (spend / leads) : 0 }
        };
      });

      return res.status(200).json({ status: "success", count: adSets.length, adSets });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (action === 'ads' || url.includes('/ads')) {
    const { ad_account_id = process.env.META_AD_ACCOUNT_ID || '', date_preset = 'last_30d', adset_id, campaign_id } = query;
    if (!token) {
      return res.status(200).json({ status: "success", count: 0, ads: [], message: "Meta token not configured" });
    }

    try {
      const client = new MetaClient(token);
      const data = await client.getAds(ad_account_id, date_preset);
      let rawAds = data.data || [];
      if (adset_id) rawAds = rawAds.filter(a => a.adset_id === adset_id);
      if (campaign_id) rawAds = rawAds.filter(a => a.campaign_id === campaign_id);

      const ads = rawAds.map(a => {
        const ins = (a.insights && a.insights.data && a.insights.data[0]) || {};
        const spend = parseFloat(ins.spend || 0);
        const impressions = parseInt(ins.impressions || 0, 10);
        const clicks = parseInt(ins.clicks || 0, 10);
        const ctr = parseFloat(ins.ctr || 0);
        const cpc = parseFloat(ins.cpc || 0);
        const cpm = parseFloat(ins.cpm || 0);
        let leads = 0;
        if (Array.isArray(ins.actions)) {
          const lAct = ins.actions.find(act => act.action_type === 'lead' || act.action_type === 'onsite_conversion.lead_grouped');
          if (lAct) leads = parseInt(lAct.value || 0, 10);
        }
        return {
          id: a.id,
          name: a.name,
          adset_id: a.adset_id,
          campaign_id: a.campaign_id,
          status: a.status,
          creative: a.creative || {},
          metrics: { spend, impressions, clicks, ctr, cpc, cpm, leads, cost_per_lead: leads > 0 ? (spend / leads) : 0 }
        };
      });

      return res.status(200).json({ status: "success", count: ads.length, ads });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // D. CAMPAIGNS MODE (/api/meta/campaigns)
  // --------------------------------------------------------------------------
  if (req.method === 'GET') {
    const { ad_account_id = process.env.META_AD_ACCOUNT_ID || '', date_preset = 'last_30d' } = query;

    if (!token) {
      let connectedAccounts = [];
      const zernioApiKey = process.env.ZERNIO_API_KEY;
      if (zernioApiKey) {
        try {
          const zRes = await httpsRequest('https://zernio.com/api/v1/accounts', {
            headers: { 'Authorization': `Bearer ${zernioApiKey}` }
          });
          const rawAccounts = (zRes && zRes.accounts) || [];
          connectedAccounts = rawAccounts.map(a => ({
            id: a._id || a.id,
            name: a.displayName || a.username || 'Meta Account',
            platform: a.platform || 'facebook',
            adsStatus: a.adsStatus || 'connected',
            followersCount: a.followersCount || 0
          }));
        } catch (zErr) {}
      }

      return res.status(200).json({
        status: "notice",
        configured: false,
        gateway: "Zernio Meta Verified",
        connectedAccounts,
        message: "Meta Graph API Marketing token is not configured directly. Connected via Zernio OAuth gateway.",
        count: 0,
        campaigns: []
      });
    }

    try {
      const client = new MetaClient(token);
      let rawCampaigns = [];
      try {
        const data = await client.getCampaigns(ad_account_id, date_preset);
        rawCampaigns = data.data || [];
      } catch (graphErr) {
        console.warn("[Meta Graph API Campaigns Warning]:", graphErr.message);
      }

      let campaigns = rawCampaigns.map(c => {
        const insights = (c.insights && c.insights.data && c.insights.data[0]) || {};
        const spend = parseFloat(insights.spend || 0);
        const impressions = parseInt(insights.impressions || 0, 10);
        const reach = parseInt(insights.reach || 0, 10);
        const clicks = parseInt(insights.clicks || 0, 10);
        const ctr = parseFloat(insights.ctr || 0);
        const cpc = parseFloat(insights.cpc || 0);
        const cpm = parseFloat(insights.cpm || 0);

        let leads = 0;
        if (Array.isArray(insights.actions)) {
          const leadAction = insights.actions.find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
          if (leadAction) leads = parseInt(leadAction.value || 0, 10);
        }

        return {
          id: c.id,
          name: c.name,
          status: c.status,
          objective: c.objective,
          daily_budget: c.daily_budget ? (parseFloat(c.daily_budget) / 100) : null,
          lifetime_budget: c.lifetime_budget ? (parseFloat(c.lifetime_budget) / 100) : null,
          start_time: c.start_time,
          stop_time: c.stop_time,
          metrics: { 
            spend, 
            impressions, 
            reach, 
            clicks, 
            ctr, 
            cpc, 
            cpm, 
            leads, 
            cost_per_lead: leads > 0 ? (spend / leads) : 0 
          }
        };
      });

      if (campaigns.length === 0 && supabase) {
        try {
          const { data: dbCamps } = await supabase.from('campaigns').select('*');
          if (dbCamps && dbCamps.length > 0) {
            campaigns = dbCamps.map(c => ({
              id: c.id,
              name: c.name,
              status: c.status || 'ACTIVE',
              objective: c.objective || 'OUTCOME_LEADS',
              daily_budget: c.daily_budget || 0,
              metrics: c.metrics || { spend: 0, impressions: 0, clicks: 0, leads: 0, cost_per_lead: 0 }
            }));
          }
        } catch (e) {}
      }

      return res.status(200).json({
        status: "success",
        ad_account_id,
        date_preset,
        count: campaigns.length,
        campaigns
      });
    } catch (err) {
      return res.status(200).json({ status: "success", count: 0, campaigns: [], error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { campaign_id, action: mutationAction, status, daily_budget, name, objective, account_id } = req.body || {};

    // 1. Create New Campaign
    if (name) {
      const newCamp = {
        id: `cmp_${Date.now()}`,
        name: name,
        status: status || 'ACTIVE',
        objective: objective || 'OUTCOME_LEADS',
        daily_budget: daily_budget ? Number(daily_budget) : 50,
        account_id: account_id || process.env.META_AD_ACCOUNT_ID || '',
        metrics: { spend: 0, impressions: 0, reach: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, leads: 0, cost_per_lead: 0 }
      };
      if (supabase) {
        await supabase.from('campaigns').insert([newCamp]).catch(() => {});
      }
      return res.status(201).json({ status: "success", campaign: newCamp });
    }

    if (token) {
      try {
        const client = new MetaClient(token);
        if (mutationAction === 'update_status' || status) {
          const targetStatus = status || (mutationAction === 'pause' ? 'PAUSED' : 'ACTIVE');
          await client.updateCampaignStatus(campaign_id, targetStatus).catch(() => {});
        }
        if (mutationAction === 'update_budget' || daily_budget !== undefined) {
          const cents = Math.round(parseFloat(daily_budget) * 100);
          await client.updateCampaignBudget(campaign_id, cents).catch(() => {});
        }
      } catch (err) {}
    }

    if (supabase && campaign_id) {
      if (status) await supabase.from('campaigns').update({ status }).eq('id', campaign_id).catch(() => {});
      if (daily_budget !== undefined) await supabase.from('campaigns').update({ daily_budget: Number(daily_budget) }).eq('id', campaign_id).catch(() => {});
    }

    return res.status(200).json({ success: true, campaign_id, status: status || 'ACTIVE', daily_budget });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = createVercelHandler(metaCampaignsUnifiedHandler);
