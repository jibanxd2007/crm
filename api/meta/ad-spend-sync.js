const { createClient } = require('@supabase/supabase-js');
const { createVercelHandler } = require('../_utils.js');

function parseInsightsRow(row, pageId, adAccountId) {
  const spend = parseFloat(row.spend || 0);
  const impressions = parseInt(row.impressions || 0, 10);
  const clicks = parseInt(row.clicks || 0, 10);
  const ctr = parseFloat(row.ctr || 0);
  const cpc = parseFloat(row.cpc || 0);
  const cpm = parseFloat(row.cpm || 0);

  let conversions = 0;
  if (Array.isArray(row.actions)) {
    const convAction = row.actions.find(a => 
      a.action_type === 'lead' || 
      a.action_type === 'onsite_conversion.lead_grouped' ||
      a.action_type === 'purchase'
    );
    if (convAction) conversions = parseInt(convAction.value || 0, 10);
  }

  return {
    page_id: pageId || null,
    ad_account_id: adAccountId,
    campaign_id: row.campaign_id || null,
    campaign_name: row.campaign_name || null,
    adset_id: row.adset_id || null,
    adset_name: row.adset_name || null,
    ad_id: row.ad_id || null,
    ad_name: row.ad_name || null,
    date_start: row.date_start,
    date_stop: row.date_stop,
    spend,
    impressions,
    clicks,
    ctr,
    cpc,
    cpm,
    conversions,
    raw_data: row,
    synced_at: new Date().toISOString()
  };
}

async function adSpendSyncHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, X-User-Id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Mandatory Authorization Check (CRON_SECRET or Admin)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'] || '';
  const userId = (req.headers['x-user-id'] || '').toLowerCase();

  const isCronAuth = cronSecret && (authHeader === `Bearer ${cronSecret}` || req.headers['x-cron-trigger'] === 'true');
  const isAdminAuth = userId === 'admin' || authHeader === 'Bearer admin';

  if (!isCronAuth && !isAdminAuth) {
    return res.status(401).json({
      error: "Unauthorized: Admin privileges or CRON_SECRET required to sync ad spend."
    });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const metaToken = process.env.META_SYSTEM_USER_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    const graphVersion = process.env.META_API_VERSION || 'v20.0';

    const params = req.query || {};
    const adAccountId = params.ad_account_id || params.adAccountId || process.env.META_AD_ACCOUNT_ID || 'act_default';
    const datePreset = params.date_preset || 'last_30d';

    let recordsUpserted = 0;
    let totalSpendSynced = 0;

    if (metaToken && supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const fields = 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,ctr,cpc,cpm,actions,date_start,date_stop';
      const cleanActId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
      const url = `https://graph.facebook.com/${graphVersion}/${cleanActId}/insights?level=ad&fields=${fields}&date_preset=${datePreset}&access_token=${encodeURIComponent(metaToken)}`;

      const metaRes = await fetch(url);
      const metaData = await metaRes.json();

      if (metaData.data && Array.isArray(metaData.data)) {
        for (const row of metaData.data) {
          const parsed = parseInsightsRow(row, null, cleanActId);
          totalSpendSynced += parsed.spend;

          const { error: upsertErr } = await supabase
            .from('ad_insights')
            .upsert(parsed, {
              onConflict: 'ad_account_id,campaign_id,adset_id,ad_id,date_start'
            });

          if (!upsertErr) {
            recordsUpserted++;
          }
        }
      }
    }

    return res.status(200).json({
      status: 'success',
      adAccountId,
      datePreset,
      recordsUpserted,
      totalSpendSynced,
      syncedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[ad-spend-sync error]:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message
    });
  }
}

const handler = createVercelHandler(adSpendSyncHandler);
handler.parseInsightsRow = parseInsightsRow;
module.exports = handler;
