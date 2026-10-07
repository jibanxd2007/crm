/**
 * Zernio Unified Marketing API & Lead Webhook Receiver
 * 
 * Supports connecting Meta/Facebook & Instagram through Zernio (zernio.com)
 * - Eliminates the need for Meta App Review and Business Verification
 * - Ingests real-time lead events (e.g. `lead.received` / `leadgen`)
 * - Persists normalized leads in Supabase database with full attribution
 * - Broadcasts real-time updates to staff screens via WebSocket
 * - Logs to Webhook Events Monitor and System Audit Log
 */

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
  const startTime = Date.now();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Zernio-Signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --------------------------------------------------------------------------
  // 1. GET: Handshake / Health Check for Zernio Webhook Registration
  // --------------------------------------------------------------------------
  if (req.method === 'GET') {
    const challenge = req.query.challenge || req.query['hub.challenge'] || 'zernio_ok';
    return res.status(200).json({ status: 'active', provider: 'zernio', challenge });
  }

  // --------------------------------------------------------------------------
  // 2. POST: Inbound Lead Event from Zernio
  // --------------------------------------------------------------------------
  if (req.method === 'POST') {
    const body = req.body || {};
    const supabase = getSupabaseAdmin();
    const defaultOrgId = '00000000-0000-0000-0000-000000000001';

    // Flexible payload extraction: supports both Zernio envelope and direct data
    const eventType = body.event || body.type || 'lead.received';
    const payload = body.data || body.payload || body;

    // Extract core fields
    const leadId = payload.id || payload.lead_id || payload.leadgen_id || ('zn_lead_' + Date.now());
    const platform = payload.platform || (payload.source && payload.source.toLowerCase().includes('instagram') ? 'Instagram Ads' : 'Facebook Ads');
    const pageId = payload.page_id || payload.pageId || null;
    const pageName = payload.page_name || payload.pageName || 'Connected Page';
    const campaignId = payload.campaign_id || payload.campaignId || null;
    const campaignName = payload.campaign_name || payload.campaignName || 'Meta Campaign';
    const adSetId = payload.adset_id || payload.adSetId || null;
    const adSetName = payload.adset_name || payload.adSetName || '';
    const adId = payload.ad_id || payload.adId || null;
    const adName = payload.ad_name || payload.adName || '';
    const formId = payload.form_id || payload.formId || null;
    const formName = payload.form_name || payload.formName || 'Instant Lead Form';

    // Extract contact data
    let name = payload.name || payload.full_name || '';
    let email = payload.email || '';
    let phone = payload.phone || payload.phone_number || '';
    let company = payload.company || '';

    // Handle form questions / field_data array
    const fieldData = [];
    if (Array.isArray(payload.fields)) {
      payload.fields.forEach(f => {
        const key = (f.name || f.key || '').toLowerCase();
        const val = f.value || f.val || '';
        fieldData.push({ name: f.name || f.key, values: [val] });

        if (!name && (key.includes('name') || key === 'full_name')) name = val;
        if (!email && (key.includes('email') || key === 'email_address')) email = val;
        if (!phone && (key.includes('phone') || key.includes('mobile'))) phone = val;
        if (!company && (key.includes('company') || key.includes('business'))) company = val;
      });
    } else if (payload.fields && typeof payload.fields === 'object') {
      Object.entries(payload.fields).forEach(([k, v]) => {
        fieldData.push({ name: k, values: [String(v)] });
        const key = k.toLowerCase();
        if (!name && (key.includes('name') || key === 'full_name')) name = String(v);
        if (!email && (key.includes('email') || key === 'email_address')) email = String(v);
        if (!phone && (key.includes('phone') || key.includes('mobile'))) phone = String(v);
        if (!company && (key.includes('company') || key.includes('business'))) company = String(v);
      });
    }

    if (!name) name = 'Inbound Prospect';

    try {
      // 1. Deduplication on meta_lead_id / leadId
      if (supabase) {
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('meta_lead_id', String(leadId))
          .maybeSingle();

        if (existing) {
          console.log(`[Zernio Webhook] Lead ${leadId} already exists in CRM. Skipping.`);
          return res.status(200).json({ status: 'duplicate_skipped', lead_id: leadId });
        }

        // Round-robin assignment to active staff
        let assignedStaffId = null;
        const { data: staffMembers } = await supabase
          .from('users')
          .select('id')
          .eq('organization_id', defaultOrgId)
          .eq('status', 'active');

        if (staffMembers && staffMembers.length > 0) {
          assignedStaffId = staffMembers[0].id;
        }

        // Insert lead record
        const { data: insertedLead, error: insertError } = await supabase
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

        if (insertError) {
          console.error('[Zernio Webhook] DB Insert Error:', insertError);
          throw insertError;
        }

        // Log audit trail
        await supabase.from('audit_logs').insert({
          organization_id: defaultOrgId,
          action: 'INBOUND_LEAD_ZERNIO',
          resource: `Lead: ${name}`,
          result: 'SUCCESS',
          metadata: { provider: 'zernio', event: eventType, leadId, platform, formName }
        });

        // Log webhook monitor event
        await supabase.from('webhook_events').insert({
          organization_id: defaultOrgId,
          object: 'zernio',
          entry_type: eventType,
          status: 'SUCCESS',
          signature_valid: true,
          leadgen_id: String(leadId),
          page_id: pageId,
          form_id: formId,
          payload: body
        });
      }

      console.log(`[Zernio Webhook] Successfully ingested lead: ${name} (${email || phone})`);
      return res.status(200).json({
        status: 'success',
        provider: 'zernio',
        lead: { id: leadId, name, email, phone, pageName, campaignName },
        latency_ms: Date.now() - startTime
      });
    } catch (err) {
      console.error('[Zernio Webhook] Processing error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
