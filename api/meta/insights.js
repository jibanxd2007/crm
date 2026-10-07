/**
 * Production Meta Marketing API Insights & Analytics Endpoint
 * GET /api/meta/insights?ad_account_id=act_123&date_preset=last_30d
 */

import { MetaClient } from '../services/meta-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.substring(7)
    : (process.env.META_SYSTEM_USER_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN);

  if (!token) {
    return res.status(401).json({
      error: 'Missing Meta Access Token.',
      message: 'Connect your Meta account via OAuth or provide an access token to view analytics.'
    });
  }

  const { ad_account_id, date_preset = 'last_30d', time_range } = req.query;

  if (!ad_account_id) {
    return res.status(400).json({ error: 'ad_account_id query parameter is required.' });
  }

  const actId = ad_account_id.startsWith('act_') ? ad_account_id : `act_${ad_account_id}`;
  const client = new MetaClient(token);

  try {
    // Map date presets to Meta Graph API valid values
    const validPresets = {
      'today': 'today',
      'yesterday': 'yesterday',
      'last_7d': 'last_7d',
      'last_30d': 'last_30d',
      'this_month': 'this_month'
    };

    let timeParam = `date_preset=${validPresets[date_preset] || 'last_30d'}`;
    if (time_range) {
      timeParam = `time_range=${encodeURIComponent(time_range)}`;
    }

    const fields = 'spend,impressions,reach,clicks,cpc,ctr,cpm,actions,cost_per_action_type,date_start,date_stop';
    const endpoint = `/${actId}/insights?fields=${fields}&${timeParam}&time_increment=1`;
    
    const data = await client.request(endpoint);
    const dayRows = data.data || [];

    // Aggregate summary
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalReach = 0;
    let totalClicks = 0;
    let totalLeads = 0;
    let totalConversions = 0;

    const timeSeries = dayRows.map(row => {
      const spend = parseFloat(row.spend || 0);
      const impressions = parseInt(row.impressions || 0, 10);
      const reach = parseInt(row.reach || 0, 10);
      const clicks = parseInt(row.clicks || 0, 10);
      const ctr = parseFloat(row.ctr || 0);
      const cpc = parseFloat(row.cpc || 0);
      const cpm = parseFloat(row.cpm || 0);

      let leads = 0;
      let conversions = 0;
      if (Array.isArray(row.actions)) {
        const leadAction = row.actions.find(a => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
        if (leadAction) leads = parseInt(leadAction.value || 0, 10);

        const purchaseAction = row.actions.find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase');
        if (purchaseAction) conversions = parseInt(purchaseAction.value || 0, 10);
      }

      totalSpend += spend;
      totalImpressions += impressions;
      totalReach += reach;
      totalClicks += clicks;
      totalLeads += leads;
      totalConversions += conversions;

      return {
        date: row.date_start,
        spend,
        impressions,
        reach,
        clicks,
        ctr,
        cpc,
        cpm,
        leads,
        conversions,
        cost_per_lead: leads > 0 ? (spend / leads) : 0
      };
    });

    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgCpc = totalClicks > 0 ? (totalSpend / totalClicks) : 0;
    const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
    const avgCpl = totalLeads > 0 ? (totalSpend / totalLeads) : 0;

    return res.status(200).json({
      ad_account_id: actId,
      date_preset,
      summary: {
        total_spend: totalSpend,
        impressions: totalImpressions,
        reach: totalReach,
        clicks: totalClicks,
        ctr: avgCtr,
        cpc: avgCpc,
        cpm: avgCpm,
        leads: totalLeads,
        conversions: totalConversions,
        cost_per_lead: avgCpl
      },
      timeSeries
    });
  } catch (err) {
    console.error('[Meta Insights API Error]:', err);
    return res.status(500).json({
      error: err.message,
      code: err.code,
      userMsg: err.userMsg || 'Could not fetch insights. Verify ads_read permission on ad account.'
    });
  }
}
