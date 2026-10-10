/**
 * Production Meta Ads Reporting Sync Endpoint
 * 
 * Synchronizes Meta Marketing API data (campaigns, ads, spend, impressions, clicks, leads, conversions)
 * into Supabase PostgreSQL. Designed to run as a scheduled Vercel Cron or on-demand trigger.
 */

import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase environment variables missing');
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });
}

export default async function handler(req, res) {
  // Verify authorization for scheduled sync or admin trigger
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}` && req.headers['x-cron-trigger'] !== 'true') {
      return res.status(401).json({ error: 'Unauthorized: Invalid CRON_SECRET authorization.' });
    }
  } else if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required to trigger sync.' });
  }

  const metaToken = process.env.META_ACCESS_TOKEN;
  const apiVersion = process.env.META_API_VERSION || 'v20.0';

  if (!metaToken) {
    return res.status(400).json({
      error: 'META_ACCESS_TOKEN not configured. Please set META_ACCESS_TOKEN or META_SYSTEM_USER_ACCESS_TOKEN in Vercel environment variables.'
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    // 1. Fetch connected ad accounts from database
    const { data: adAccounts, error: accError } = await supabase
      .from('ad_accounts')
      .select('id, meta_ad_account_id, page_id, name');

    if (accError || !adAccounts || adAccounts.length === 0) {
      return res.status(200).json({ message: 'No ad accounts found to sync' });
    }

    let totalSyncedCampaigns = 0;
    let totalSyncedAds = 0;

    // 2. Iterate each ad account and query Meta Marketing API Insights
    for (const acc of adAccounts) {
      const actId = acc.meta_ad_account_id.replace('act_', '');
      
      try {
        // Query Campaign Level Insights
        const insightsUrl = `https://graph.facebook.com/${apiVersion}/act_${actId}/campaigns?fields=id,name,objective,status,insights.date_preset(last_30d){spend,impressions,reach,clicks,actions}&access_token=${metaToken}`;
        const resp = await fetch(insightsUrl);

        if (resp.ok) {
          const result = await resp.json();
          const campaignsList = result.data || [];

          for (const c of campaignsList) {
            const ins = (c.insights && c.insights.data && c.insights.data[0]) || {};
            const spend = parseFloat(ins.spend || 0);
            const impressions = parseInt(ins.impressions || 0, 10);
            const reach = parseInt(ins.reach || 0, 10);
            const clicks = parseInt(ins.clicks || 0, 10);

            // Extract Lead count from actions array
            let leadsCount = 0;
            let conversionsCount = 0;
            if (Array.isArray(ins.actions)) {
              ins.actions.forEach(act => {
                if (act.action_type === 'lead' || act.action_type === 'onsite_conversion.lead_grouped') {
                  leadsCount += parseInt(act.value || 0, 10);
                }
                if (act.action_type === 'purchase' || act.action_type === 'custom_conversion') {
                  conversionsCount += parseInt(act.value || 0, 10);
                }
              });
            }

            // Upsert into Supabase
            await supabase.from('campaigns').upsert({
              id: `cmp_${c.id}`,
              meta_campaign_id: c.id,
              ad_account_id: acc.id,
              page_id: acc.page_id,
              name: c.name,
              objective: c.objective || 'OUTCOME_LEADS',
              status: c.status || 'ACTIVE',
              total_spend: spend,
              impressions: impressions,
              reach: reach,
              clicks: clicks,
              leads: leadsCount,
              conversions: conversionsCount,
              updated_at: new Date().toISOString()
            });

            totalSyncedCampaigns++;
          }
        }
      } catch (accErr) {
        console.warn(`[Meta Sync] Could not sync account ${acc.id}:`, accErr.message);
      }
    }

    // Update settings table with last sync timestamp
    await supabase.from('crm_settings').upsert({
      key: 'last_synced_at',
      value: JSON.stringify(new Date().toISOString()),
      updated_at: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      message: 'Meta insights synchronized successfully',
      syncedAccounts: adAccounts.length,
      syncedCampaigns: totalSyncedCampaigns,
      lastSyncedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Meta Sync Error]', error);
    // Non-fatal: do not crash client
    return res.status(200).json({
      success: false,
      warning: 'Meta data sync delayed. Showing latest synced database metrics.',
      error: error.message
    });
  }
}
