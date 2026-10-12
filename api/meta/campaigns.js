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
const { createVercelHandler } = require('../_utils.js');

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

          return res.status(200).json({
            connection: connRes.data || null,
            pages: pagesRes.data || [],
            adAccounts: adAccRes.data || []
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
  // C. AD SETS & ADS DRILLDOWN MODES
  // --------------------------------------------------------------------------
  if (action === 'adsets' || url.includes('/adsets')) {
    const { ad_account_id = 'act_104829104812', date_preset = 'last_30d', campaign_id } = query;
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
    const { ad_account_id = 'act_104829104812', date_preset = 'last_30d', adset_id, campaign_id } = query;
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
    const { ad_account_id = 'act_104829104812', date_preset = 'last_30d' } = query;

    if (!token) {
      // Return structured response indicating unconfigured live credentials
      return res.status(200).json({
        status: "notice",
        configured: false,
        message: "Meta Access Token not configured on server. Please set META_ACCESS_TOKEN in environment variables.",
        count: 0,
        campaigns: []
      });
    }

    try {
      const client = new MetaClient(token);
      const data = await client.getCampaigns(ad_account_id, date_preset);
      const rawCampaigns = data.data || [];

      const campaigns = rawCampaigns.map(c => {
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

      return res.status(200).json({
        status: "success",
        ad_account_id,
        date_preset,
        count: campaigns.length,
        campaigns
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { campaign_id, action: mutationAction, status, daily_budget } = req.body || {};
    if (!token) {
      return res.status(500).json({ error: 'Meta Access Token not configured.' });
    }

    try {
      const client = new MetaClient(token);
      if (mutationAction === 'update_status' || status) {
        const targetStatus = status || (mutationAction === 'pause' ? 'PAUSED' : 'ACTIVE');
        const result = await client.updateCampaignStatus(campaign_id, targetStatus);
        return res.status(200).json({ success: true, campaign_id, status: targetStatus });
      }

      if (mutationAction === 'update_budget' || daily_budget !== undefined) {
        const cents = Math.round(parseFloat(daily_budget) * 100);
        const result = await client.updateCampaignBudget(campaign_id, cents);
        return res.status(200).json({ success: true, campaign_id, daily_budget });
      }

      return res.status(400).json({ error: 'Unknown action specified.' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = createVercelHandler(metaCampaignsUnifiedHandler);
