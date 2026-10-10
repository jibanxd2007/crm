const { createClient } = require('@supabase/supabase-js');
const { createVercelHandler } = require('../_utils.js');

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });
}

async function zernioWebhookHandler(req, res) {
  const startTime = Date.now();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Zernio-Signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. GET: Handshake / Health Check for Zernio Webhook Registration
  if (req.method === 'GET') {
    const challenge = req.query?.challenge || req.query?.['hub.challenge'] || 'zernio_ok';
    return res.status(200).json({ status: 'active', provider: 'zernio', challenge });
  }

  // 2. POST: Inbound Lead Event from Zernio
  if (req.method === 'POST') {
    const body = req.body || {};
    const supabase = getSupabaseAdmin();
    const defaultOrgId = '00000000-0000-0000-0000-000000000001';

    const eventType = body.event || body.type || 'lead.received';
    const payload = body.data || body.payload || body;

    const leadId = payload.id || payload.lead_id || payload.leadgen_id || ('zn_lead_' + Date.now());
    const platform = payload.platform || (payload.source && payload.source.toLowerCase().includes('instagram') ? 'Instagram Ads' : 'Facebook Ads');
    const pageId = payload.page_id || payload.pageId || null;
    const pageName = payload.page_name || payload.pageName || 'Connected Page';
    const campaignId = payload.campaign_id || payload.campaignId || null;
    const campaignName = payload.campaign_name || payload.campaignName || 'Meta Campaign';
    const adSetId = payload.adset_id || payload.adSetId || null;
    const adSetName = payload.adset_name || payload.adSetName || 'AdSet';
    const adId = payload.ad_id || payload.adId || null;
    const adName = payload.ad_name || payload.adName || 'Ad Creative';
    const formId = payload.form_id || payload.formId || null;
    const formName = payload.form_name || payload.formName || 'Instant Lead Form';

    const name = payload.name || payload.full_name || 'Prospect Lead';
    const email = payload.email || null;
    const phone = payload.phone || payload.phone_number || null;
    const company = payload.company || null;
    const fieldData = payload.field_data || payload.custom_fields || [];

    try {
      if (supabase) {
        let assignedStaffId = null;
        const { data: staffMembers } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'staff')
          .limit(1);

        if (staffMembers && staffMembers.length > 0) {
          assignedStaffId = staffMembers[0].id;
        }

        await supabase
          .from('leads')
          .insert({
            organization_id: defaultOrgId,
            meta_lead_id: String(leadId),
            name,
            email,
            phone,
            company,
            source: platform.toLowerCase().includes('instagram') ? 'Instagram Ads' : 'Facebook Ads',
            page_id: pageId ? (pageId.startsWith('page_') ? pageId : `page_${pageId}`) : null,
            page_name: pageName,
            campaign_id: campaignId,
            campaign_name: campaignName,
            adset_id: adSetId,
            adset_name: adSetName,
            ad_id: adId,
            ad_name: adName,
            form_id: formId,
            form_name: formName,
            field_data: fieldData,
            assigned_to: assignedStaffId,
            status: 'new'
          })
          .select()
          .single();
      }

      return res.status(200).json({
        status: 'success',
        provider: 'zernio',
        lead: { id: leadId, name, email, phone, pageName, campaignName, source: platform },
        latency_ms: Date.now() - startTime
      });
    } catch (err) {
      console.error('[Zernio Webhook] Processing error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = createVercelHandler(zernioWebhookHandler);
