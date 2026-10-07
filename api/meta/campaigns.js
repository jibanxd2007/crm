/**
 * Production Meta Marketing API Campaigns Endpoint
 * 
 * GET /api/meta/campaigns?ad_account_id=act_123&date_preset=last_30d
 * POST /api/meta/campaigns (update status or budget)
 */

import { MetaClient } from '../services/meta-client.js';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Token resolution (from Authorization header or environment)
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer ')) 
    ? authHeader.substring(7) 
    : (process.env.META_SYSTEM_USER_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN);

  if (!token) {
    return res.status(401).json({
      error: 'Missing Meta Access Token.',
      message: 'Connect your Meta account via OAuth or provide an access token to view live campaigns.'
    });
  }

  const client = new MetaClient(token);
  const supabase = getSupabaseAdmin();

  // --------------------------------------------------------------------------
  // GET: Retrieve Live Campaigns & Insights
  // --------------------------------------------------------------------------
  if (req.method === 'GET') {
    const { ad_account_id, date_preset = 'last_30d' } = req.query;

    if (!ad_account_id) {
      return res.status(400).json({ error: 'ad_account_id query parameter is required.' });
    }

    try {
      const data = await client.getCampaigns(ad_account_id, date_preset);
      const rawCampaigns = data.data || [];

      // Process campaigns and normalize insights
      const campaigns = rawCampaigns.map(c => {
        const insights = (c.insights && c.insights.data && c.insights.data[0]) || {};
        const spend = parseFloat(insights.spend || 0);
        const impressions = parseInt(insights.impressions || 0, 10);
        const reach = parseInt(insights.reach || 0, 10);
        const clicks = parseInt(insights.clicks || 0, 10);
        const ctr = parseFloat(insights.ctr || 0);
        const cpc = parseFloat(insights.cpc || 0);
        const cpm = parseFloat(insights.cpm || 0);

        // Extract leads from actions
        let leads = 0;
        let conversions = 0;
        if (Array.isArray(insights.actions)) {
          const leadAction = insights.actions.find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
          if (leadAction) leads = parseInt(leadAction.value || 0, 10);

          const purchaseAction = insights.actions.find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
          if (purchaseAction) conversions = parseInt(purchaseAction.value || 0, 10);
        }

        const cpl = leads > 0 ? (spend / leads) : 0;

        return {
          id: c.id,
          name: c.name,
          status: c.status,
          objective: c.objective,
          daily_budget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : null,
          lifetime_budget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
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
            conversions,
            cost_per_lead: cpl
          }
        };
      });

      // Optionally cache into Supabase
      if (supabase && campaigns.length > 0) {
        for (const c of campaigns) {
          await supabase.from('campaigns').upsert({
            id: `cmp_${c.id}`,
            meta_campaign_id: c.id,
            ad_account_id: ad_account_id.startsWith('act_') ? ad_account_id : `act_${ad_account_id}`,
            name: c.name,
            objective: c.objective,
            status: c.status,
            daily_budget: c.daily_budget || 0,
            lifetime_budget: c.lifetime_budget || 0,
            total_spend: c.metrics.spend,
            impressions: c.metrics.impressions,
            reach: c.metrics.reach,
            clicks: c.metrics.clicks,
            ctr: c.metrics.ctr,
            cpc: c.metrics.cpc,
            cpm: c.metrics.cpm,
            leads: c.metrics.leads,
            conversions: c.metrics.conversions,
            last_synced_at: new Date().toISOString()
          }, { onConflict: 'organization_id, meta_campaign_id' }).catch(() => {});
        }
      }

      return res.status(200).json({
        ad_account_id,
        date_preset,
        count: campaigns.length,
        campaigns
      });
    } catch (err) {
      console.error('[Meta Marketing API] Campaign fetch error:', err);
      return res.status(500).json({
        error: err.message,
        code: err.code,
        userMsg: err.userMsg || 'Could not retrieve campaigns from Meta Marketing API. Verify ads_read permission.'
      });
    }
  }

  // --------------------------------------------------------------------------
  // POST: Update Campaign Status or Budget (Pause / Resume / Adjust Budget)
  // --------------------------------------------------------------------------
  if (req.method === 'POST') {
    const { campaign_id, action, status, daily_budget } = req.body || {};

    if (!campaign_id) {
      return res.status(400).json({ error: 'campaign_id is required.' });
    }

    try {
      if (action === 'update_status' || status) {
        const targetStatus = status || (action === 'pause' ? 'PAUSED' : 'ACTIVE');
        const result = await client.updateCampaignStatus(campaign_id, targetStatus);
        
        if (supabase) {
          await supabase.from('campaigns')
            .update({ status: targetStatus, updated_at: new Date().toISOString() })
            .eq('meta_campaign_id', campaign_id);

          await supabase.from('audit_logs').insert({
            action: `CAMPAIGN_${targetStatus}`,
            resource_type: 'campaign',
            resource_id: campaign_id,
            metadata: { result }
          });
        }

        return res.status(200).json({ success: true, campaign_id, status: targetStatus });
      }

      if (action === 'update_budget' || daily_budget !== undefined) {
        const cents = Math.round(parseFloat(daily_budget) * 100);
        const result = await client.updateCampaignBudget(campaign_id, cents);

        if (supabase) {
          await supabase.from('campaigns')
            .update({ daily_budget: parseFloat(daily_budget), updated_at: new Date().toISOString() })
            .eq('meta_campaign_id', campaign_id);

          await supabase.from('audit_logs').insert({
            action: 'CAMPAIGN_BUDGET_UPDATED',
            resource_type: 'campaign',
            resource_id: campaign_id,
            metadata: { daily_budget }
          });
        }

        return res.status(200).json({ success: true, campaign_id, daily_budget });
      }

      return res.status(400).json({ error: 'Unknown action specified.' });
    } catch (err) {
      console.error('[Meta Marketing API] Campaign mutation error:', err);
      return res.status(500).json({
        error: err.message,
        code: err.code,
        userMsg: err.userMsg || 'Marketing API action requires ads_management permission and verified business account.'
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
