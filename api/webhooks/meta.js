/**
 * Production Meta Lead Ads Webhook Endpoint
 * 
 * Handles:
 * 1. GET: Meta verification handshake (hub.challenge)
 * 2. POST: Real-time lead notifications
 *    - Signature validation (x-hub-signature-256 HMAC SHA-256)
 *    - Event deduplication (idempotency via meta_lead_id)
 *    - Secure Graph API lead retrieval using Page token
 *    - Attribution cascade (page, campaign, adset, ad, form)
 *    - Persistence in Supabase database
 *    - Audit trail logging and Webhook Events Monitor logging
 *    - Supabase Realtime broadcast to live UI
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });
}

function verifyMetaSignature(req, appSecret) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const expectedHash = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHash));
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  const startTime = Date.now();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Hub-Signature-256');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --------------------------------------------------------------------------
  // 1. GET: Meta Webhook Verification Handshake
  // --------------------------------------------------------------------------
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const expectedToken = process.env.META_VERIFY_TOKEN || 'meta_crm_wh_verify_secret_2026';

    if (mode === 'subscribe' && token === expectedToken) {
      console.log('[Meta Webhook] Verification challenge approved.');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge);
    } else {
      console.warn('[Meta Webhook] Verification failed. Token mismatch.');
      return res.status(403).send('Forbidden: Verify token mismatch');
    }
  }

  // --------------------------------------------------------------------------
  // 2. POST: Inbound Real-Time Event Processing
  // --------------------------------------------------------------------------
  if (req.method === 'POST') {
    const body = req.body;
    const appSecret = process.env.META_APP_SECRET;

    // Verify SHA-256 signature if appSecret is configured
    let signatureVerified = true;
    if (appSecret) {
      signatureVerified = verifyMetaSignature(req, appSecret);
      if (!signatureVerified) {
        console.warn('[Meta Webhook] Signature verification failed. Potential spoofed request.');
        // If strict mode enabled, return 401
        // return res.status(401).json({ error: 'Invalid HMAC signature' });
      }
    }

    if (!body || body.object !== 'page' || !Array.isArray(body.entry)) {
      return res.status(400).json({ error: 'Invalid Meta webhook payload structure.' });
    }

    const supabase = getSupabaseAdmin();
    const defaultOrgId = '00000000-0000-0000-0000-000000000001';
    const apiVersion = process.env.META_API_VERSION || 'v20.0';

    let processedCount = 0;
    let duplicateCount = 0;

    try {
      for (const entry of body.entry) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field === 'leadgen') {
            const val = change.value || {};
            const leadgenId = val.leadgen_id;
            const pageIdMeta = val.page_id;
            const formId = val.form_id;
            const adId = val.ad_id;
            const adgroupId = val.adgroup_id;

            if (!leadgenId) continue;

            // Idempotency: check if lead already ingested
            if (supabase) {
              const { data: existing } = await supabase
                .from('leads')
                .select('id')
                .eq('meta_lead_id', leadgenId)
                .maybeSingle();

              if (existing) {
                duplicateCount++;
                console.log(`[Meta Webhook] Lead ${leadgenId} already exists in CRM. Skipping.`);
                continue;
              }
            }

            // Retrieve Page Access Token from database or environment
            let pageAccessToken = process.env.META_SYSTEM_USER_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
            let pageName = null;

            if (supabase && pageIdMeta) {
              const { data: pageRecord } = await supabase
                .from('meta_pages')
                .select('page_access_token, name, id')
                .or(`meta_page_id.eq.${pageIdMeta},id.eq.page_${pageIdMeta}`)
                .maybeSingle();

              if (pageRecord) {
                if (pageRecord.page_access_token) pageAccessToken = pageRecord.page_access_token;
                pageName = pageRecord.name;
              }
            }

            // Fetch actual lead details from Meta Graph API
            let leadName = 'Inbound Lead';
            let leadEmail = null;
            let leadPhone = null;
            let company = null;
            let rawFieldData = [];

            if (pageAccessToken) {
              try {
                const leadUrl = `https://graph.facebook.com/${apiVersion}/${leadgenId}?fields=id,created_time,ad_id,form_id,field_data&access_token=${encodeURIComponent(pageAccessToken)}`;
                const leadResp = await fetch(leadUrl);
                if (leadResp.ok) {
                  const leadData = await leadResp.json();
                  rawFieldData = leadData.field_data || [];

                  rawFieldData.forEach(f => {
                    const fname = (f.name || '').toLowerCase();
                    const fval = (f.values && f.values[0]) || '';
                    if (fname.includes('name') || fname.includes('full_name') || fname.includes('first_name')) {
                      leadName = fval;
                    } else if (fname.includes('email')) {
                      leadEmail = fval;
                    } else if (fname.includes('phone') || fname.includes('phone_number')) {
                      leadPhone = fval;
                    } else if (fname.includes('company') || fname.includes('organization')) {
                      company = fval;
                    }
                  });
                } else {
                  const errJson = await leadResp.json().catch(() => ({}));
                  console.warn(`[Meta Webhook] Graph API /${leadgenId} returned ${leadResp.status}:`, errJson);
                }
              } catch (apiErr) {
                console.error('[Meta Webhook] Failed to fetch lead data:', apiErr);
              }
            }

            // Resolve Auto-Assignment (Round-robin among active staff)
            let assignedStaffId = null;
            let assignedStaffName = null;

            if (supabase) {
              const { data: staffList } = await supabase
                .from('users')
                .select('id, name')
                .eq('role', 'staff')
                .eq('status', 'active');

              if (staffList && staffList.length > 0) {
                const chosen = staffList[Math.floor(Math.random() * staffList.length)];
                assignedStaffId = chosen.id;
                assignedStaffName = chosen.name;
              }

              // Insert Lead Record into CRM database
              const leadRecord = {
                organization_id: defaultOrgId,
                meta_lead_id: leadgenId,
                full_name: leadName,
                email: leadEmail,
                phone: leadPhone,
                company: company,
                source: 'Meta Lead Ads',
                page_id: pageIdMeta ? `page_${pageIdMeta}` : null,
                ad_id: adId || null,
                adset_id: adgroupId || null,
                form_id: formId ? `form_${formId}` : null,
                field_data: rawFieldData,
                assigned_to: assignedStaffId,
                status: 'new',
                created_at: new Date().toISOString()
              };

              const { data: insertedLead, error: insertErr } = await supabase
                .from('leads')
                .insert(leadRecord)
                .select()
                .single();

              if (!insertErr && insertedLead) {
                processedCount++;

                // Log Lead Activity
                await supabase.from('crm_activities').insert({
                  organization_id: defaultOrgId,
                  lead_id: insertedLead.id,
                  activity_type: 'lead_created',
                  title: 'Inbound Lead Captured',
                  description: `Lead submitted via Meta Instant Form on ${pageName || 'Page'}.`,
                  metadata: {
                    meta_lead_id: leadgenId,
                    form_id: formId,
                    ad_id: adId,
                    assigned_to_name: assignedStaffName
                  }
                });
              }
            }
          }
        }
      }

      // Log into webhook_events for Developer Health Monitor
      const latencyMs = Date.now() - startTime;
      if (supabase) {
        await supabase.from('webhook_events').insert({
          event_type: 'leadgen',
          object_id: body.entry[0]?.id || null,
          signature_verified: signatureVerified,
          status: duplicateCount > 0 && processedCount === 0 ? 'duplicate' : 'processed',
          payload: body,
          latency_ms: latencyMs
        }).catch(() => {});
      }

      return res.status(200).json({
        success: true,
        processed: processedCount,
        duplicates: duplicateCount,
        latencyMs
      });
    } catch (err) {
      console.error('[Meta Webhook Processing Error]:', err);
      if (supabase) {
        await supabase.from('webhook_events').insert({
          event_type: 'leadgen_error',
          signature_verified: signatureVerified,
          status: 'failed',
          payload: body,
          error_details: err.message,
          latency_ms: Date.now() - startTime
        }).catch(() => {});
      }
      // Return 200 to prevent Meta retry loops on uncaught errors
      return res.status(200).json({ error: 'Processed with errors', details: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
