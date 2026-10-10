const { verifyMetaSignature, createVercelHandler } = require('../_utils.js');
const { createClient } = require('@supabase/supabase-js');

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });
}

async function webhooksMetaHandler(req, res) {
  const startTime = Date.now();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Hub-Signature-256');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. GET: Meta Webhook Verification Handshake
  if (req.method === 'GET') {
    const query = req.query || {};
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const expectedToken = process.env.META_VERIFY_TOKEN;
    if (!expectedToken) {
      return res.status(500).json({ error: 'Server misconfiguration: META_VERIFY_TOKEN is missing' });
    }

    if (mode === 'subscribe' && token === expectedToken) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge);
    } else {
      return res.status(403).json({ error: 'Forbidden: Verify token mismatch' });
    }
  }

  // 2. POST: Inbound Real-Time Event Processing
  if (req.method === 'POST') {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      return res.status(500).json({ error: 'Server misconfiguration: META_APP_SECRET missing' });
    }

    const signatureHeader = req.headers['x-hub-signature-256'] || req.headers['X-Hub-Signature-256'];
    const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    const signatureVerified = verifyMetaSignature(rawBody, signatureHeader, appSecret);

    if (!signatureVerified) {
      return res.status(401).json({ error: 'Invalid or missing Meta X-Hub-Signature-256' });
    }

    const body = (typeof req.body === 'object') ? req.body : JSON.parse(rawBody || '{}');
    const supabase = getSupabaseAdmin();
    const defaultOrgId = '00000000-0000-0000-0000-000000000001';
    const apiVersion = process.env.META_API_VERSION || 'v20.0';

    let processedCount = 0;
    let duplicateCount = 0;

    try {
      if (body && Array.isArray(body.entry)) {
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

              if (supabase) {
                const { data: existing } = await supabase
                  .from('leads')
                  .select('id')
                  .eq('meta_lead_id', leadgenId)
                  .maybeSingle();

                if (existing) {
                  duplicateCount++;
                  continue;
                }
              }

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
                  }
                } catch (apiErr) {
                  console.warn('[Meta Webhook] Graph API fetch note:', apiErr.message);
                }
              }

              let assignedStaffId = null;
              let leadValue = 0;
              if (rawFieldData && Array.isArray(rawFieldData)) {
                for (const field of rawFieldData) {
                  const valStr = String(field.values ? field.values[0] : field.value || '');
                  const numVal = parseFloat(valStr.replace(/[^0-9.]/g, ''));
                  if (!isNaN(numVal) && numVal > leadValue) {
                    leadValue = numVal;
                  }
                }
              }
              const isHotLead = leadValue >= 50000;

              if (supabase) {
                const { data: staffList } = await supabase
                  .from('users')
                  .select('id, name')
                  .eq('role', 'staff')
                  .eq('status', 'active');

                if (staffList && staffList.length > 0) {
                  const chosen = staffList[Math.floor(Math.random() * staffList.length)];
                  assignedStaffId = chosen.id;
                }

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
                  lead_value: leadValue,
                  sla_target_minutes: 5,
                  is_hot_lead: isHotLead,
                  created_at: new Date().toISOString()
                };

                const { data: insertedLead } = await supabase
                  .from('leads')
                  .insert(leadRecord)
                  .select()
                  .single();

                if (insertedLead) {
                  processedCount++;
                  if (assignedStaffId) {
                    await supabase.from('notifications').insert({
                      user_id: assignedStaffId,
                      lead_id: insertedLead.id,
                      type: 'new_lead',
                      title: 'New Lead Inbound',
                      message: `${leadName} submitted instant form on ${pageName || 'Page'}.`,
                      payload: { lead_id: insertedLead.id, name: leadName, phone: leadPhone, is_hot: isHotLead, value: leadValue }
                    });
                  }
                }
              } else {
                processedCount++;
              }
            }
          }
        }
      }

      const latencyMs = Date.now() - startTime;
      return res.status(200).json({
        status: "success",
        processed: true,
        eventId: body.entry && body.entry[0] ? body.entry[0].id : `evt_${Date.now()}`,
        pageId: body.entry && body.entry[0] ? body.entry[0].id : 'page_01',
        slaTargetMinutes: 5,
        notificationsDispatched: true,
        signatureVerified: true,
        processedCount,
        duplicates: duplicateCount,
        latencyMs,
        receivedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('[Meta Webhook Processing Error]:', err);
      return res.status(200).json({ error: 'Processed with errors', details: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = createVercelHandler(webhooksMetaHandler);
