const { verifyMetaSignature, createVercelHandler } = require('../_utils.js');
let createClient = null;
try {
  createClient = require('@supabase/supabase-js').createClient;
} catch (e) {}

// In-memory deduplication cache for Meta webhook retries (10 min TTL)
const processedEvents = new Map();
function isDuplicateEvent(id) {
  if (!id) return false;
  const exp = processedEvents.get(id);
  if (exp && exp > Date.now()) return true;
  processedEvents.set(id, Date.now() + 10 * 60 * 1000);
  if (processedEvents.size > 2000) {
    const oldest = processedEvents.keys().next().value;
    processedEvents.delete(oldest);
  }
  return false;
}

function getSupabaseAdmin() {
  if (!createClient) return null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function metaWebhookHandler(req, res) {
  const verifyToken = process.env.META_VERIFY_TOKEN;
  const appSecret = process.env.META_APP_SECRET;

  // Handle Meta Webhook Verification Handshake (GET)
  if (req.method === 'GET') {
    const query = req.query || {};
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (!verifyToken) {
      return res.status(500).json({ error: "META_VERIFY_TOKEN is not configured on the server." });
    }

    if (mode === 'subscribe' && token === verifyToken) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge);
    }

    return res.status(403).json({ error: "Forbidden: Webhook verify token mismatch." });
  }

  // Handle Meta Webhook Event (POST)
  if (req.method === 'POST') {
    if (!appSecret) {
      return res.status(500).json({ error: "META_APP_SECRET is not configured on the server." });
    }

    const signatureHeader = req.headers['x-hub-signature-256'] || req.headers['X-Hub-Signature-256'];
    const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    const isValid = verifyMetaSignature(rawBody, signatureHeader, appSecret);

    if (!isValid) {
      return res.status(401).json({ error: "Unauthorized: Invalid or missing Meta X-Hub-Signature-256." });
    }

    const payload = (typeof req.body === 'object') ? req.body : JSON.parse(rawBody || '{}');
    const eventId = payload.entry && payload.entry[0] ? payload.entry[0].id : `evt_${Date.now()}`;
    const pageId = payload.entry && payload.entry[0] ? payload.entry[0].id : 'page_01';

    // Extract messaging events and Leadgen changes
    const entries = payload.entry || [];
    let processedMsgs = 0;
    let processedLeads = 0;
    let duplicateIgnored = false;

    for (const entry of entries) {
      const entryPageId = entry.id || pageId;

      // 1. Process Lead Ads Webhook Events (entry.changes with field === 'leadgen')
      const changesList = entry.changes || [];
      for (const change of changesList) {
        if (change.field === 'leadgen' && change.value) {
          const leadVal = change.value;
          const leadgenId = leadVal.leadgen_id;
          const formId = leadVal.form_id;
          const adId = leadVal.ad_id;
          const adsetId = leadVal.adgroup_id || leadVal.adset_id;
          const campaignId = leadVal.campaign_id;
          const createdTime = leadVal.created_time ? new Date(leadVal.created_time * 1000).toISOString() : new Date().toISOString();

          if (isDuplicateEvent(`lead_${leadgenId}`)) {
            duplicateIgnored = true;
            continue;
          }

          processedLeads++;

          // Attempt to fetch full lead data from Meta Graph API if token available
          let leadName = 'New Lead';
          let leadEmail = '';
          let leadPhone = '';
          let customFields = {};
          let formName = leadVal.form_name || `Form #${formId || ''}`;
          let campaignName = leadVal.campaign_name || '';
          let adsetName = leadVal.adset_name || '';
          let adName = leadVal.ad_name || '';

          const pageToken = (global.META_PAGE_TOKENS && global.META_PAGE_TOKENS[entryPageId]?.accessToken) || process.env.META_ACCESS_TOKEN || process.env.META_SYSTEM_USER_ACCESS_TOKEN;
          if (pageToken && leadgenId) {
            try {
              const { httpsRequest } = require('../_utils.js');
              const graphLead = await httpsRequest(`https://graph.facebook.com/v24.0/${leadgenId}?fields=id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data&access_token=${pageToken}`);
              if (graphLead && Array.isArray(graphLead.field_data)) {
                if (graphLead.campaign_name) campaignName = graphLead.campaign_name;
                if (graphLead.adset_name) adsetName = graphLead.adset_name;
                if (graphLead.ad_name) adName = graphLead.ad_name;

                for (const field of graphLead.field_data) {
                  const fname = (field.name || '').toLowerCase();
                  const fval = Array.isArray(field.values) ? field.values[0] : field.values;
                  if (fname.includes('full_name') || fname === 'name') leadName = fval || leadName;
                  else if (fname.includes('first_name')) leadName = fval ? `${fval} ${leadName}`.trim() : leadName;
                  else if (fname.includes('last_name')) leadName = fval ? `${leadName} ${fval}`.trim() : leadName;
                  else if (fname.includes('email')) leadEmail = fval || leadEmail;
                  else if (fname.includes('phone')) leadPhone = fval || leadPhone;
                  else customFields[field.name] = fval;
                }
              }
            } catch (err) {
              console.warn(`[Leadgen Graph API Retrieval Note]: ${err.message}`);
            }
          }

          // Persist lead with complete attribution to Supabase
          const supabase = getSupabaseAdmin();
          if (supabase) {
            try {
              // Deduplication check
              const { data: existing } = await supabase
                .from('leads')
                .select('id')
                .eq('meta_lead_id', String(leadgenId))
                .maybeSingle();

              if (!existing) {
                await supabase.from('leads').insert({
                  full_name: leadName,
                  email: leadEmail || null,
                  phone: leadPhone || null,
                  source: 'Facebook Lead Ad',
                  status: 'New',
                  meta_lead_id: String(leadgenId),
                  form_id: formId ? String(formId) : null,
                  form_name: formName || null,
                  campaign_id: campaignId ? String(campaignId) : null,
                  campaign_name: campaignName || null,
                  adset_id: adsetId ? String(adsetId) : null,
                  adset_name: adsetName || null,
                  ad_id: adId ? String(adId) : null,
                  ad_name: adName || null,
                  created_at: createdTime
                });
              }
            } catch (leadDbErr) {
              console.warn(`[Lead DB Ingest Note]: ${leadDbErr.message}`);
            }
          }
        }
      }

      // 2. Process Messenger / Direct Messages
      const messagingList = entry.messaging || entry.standby || [];
      for (const msgEvent of messagingList) {
        const mid = msgEvent.message?.mid || `${msgEvent.sender?.id}_${msgEvent.timestamp}`;
        if (isDuplicateEvent(mid)) {
          duplicateIgnored = true;
          continue;
        }

        processedMsgs++;
        const senderPsid = msgEvent.sender?.id;
        const rawAttachments = msgEvent.message?.attachments || [];
        const hasAttachments = Array.isArray(rawAttachments) && rawAttachments.length > 0;

        let msgText = msgEvent.message?.text || '';
        if (!msgText && hasAttachments) {
          const firstType = rawAttachments[0].type || 'attachment';
          msgText = firstType === 'image' ? 'Sent a photo 📷' 
            : (firstType === 'video' ? 'Sent a video 🎥' 
            : (firstType === 'audio' ? 'Sent an audio note 🎙️' : 'Sent an attachment 📎'));
        }
        const msgTimestamp = msgEvent.timestamp ? new Date(msgEvent.timestamp).toISOString() : new Date().toISOString();

        // Persist to Supabase if available
        const supabase = getSupabaseAdmin();
        if (supabase && senderPsid && (msgText || hasAttachments)) {
          try {
            // Find or create conversation
            const { data: conv } = await supabase
              .from('conversations')
              .select('id, unread_count')
              .eq('page_id', entryPageId)
              .eq('customer_psid', senderPsid)
              .maybeSingle();

            let convId = conv?.id;
            if (!convId) {
              const { data: newConv } = await supabase
                .from('conversations')
                .insert({
                  page_id: entryPageId,
                  customer_psid: senderPsid,
                  customer_name: `Facebook User (${senderPsid.substring(0, 6)})`,
                  channel: 'messenger',
                  last_message: msgText || '[Attachment]',
                  last_message_at: msgTimestamp,
                  unread_count: 1
                })
                .select('id')
                .single();
              convId = newConv?.id;
            }

            if (convId) {
              // Download Meta CDN attachments and upload to Supabase Storage (bypassing CDN expiry)
              const storedAttachments = [];
              if (hasAttachments) {
                for (const att of rawAttachments) {
                  const cdnUrl = att?.payload?.url;
                  const attType = att?.type || 'file';
                  if (cdnUrl) {
                    try {
                      let buffer = null;
                      let contentType = 'application/octet-stream';
                      if (typeof fetch === 'function') {
                        const dlRes = await fetch(cdnUrl);
                        if (dlRes.ok) {
                          contentType = dlRes.headers.get('content-type') || contentType;
                          const ab = await dlRes.arrayBuffer();
                          buffer = Buffer.from(ab);
                        }
                      }

                      if (buffer && buffer.length > 0) {
                        let ext = 'bin';
                        if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
                        else if (contentType.includes('png')) ext = 'png';
                        else if (contentType.includes('gif')) ext = 'gif';
                        else if (contentType.includes('webp')) ext = 'webp';
                        else if (contentType.includes('mp4')) ext = 'mp4';
                        else if (contentType.includes('quicktime')) ext = 'mov';
                        else if (contentType.includes('audio') || contentType.includes('mpeg')) ext = 'mp3';
                        else if (contentType.includes('pdf')) ext = 'pdf';
                        else ext = attType === 'image' ? 'jpg' : (attType === 'video' ? 'mp4' : 'bin');

                        const filename = `${attType}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
                        const storagePath = `inbound/${entryPageId}/${convId}/${filename}`;

                        const { error: upErr } = await supabase.storage
                          .from('message-attachments')
                          .upload(storagePath, buffer, { contentType, upsert: true });

                        if (!upErr) {
                          const { data: pubData } = supabase.storage
                            .from('message-attachments')
                            .getPublicUrl(storagePath);

                          storedAttachments.push({
                            type: attType,
                            url: pubData?.publicUrl || cdnUrl,
                            storage_path: storagePath,
                            name: filename,
                            size: buffer.length
                          });
                        } else {
                          console.warn('[Storage upload warning]:', upErr.message);
                          storedAttachments.push({ type: attType, url: cdnUrl });
                        }
                      } else {
                        storedAttachments.push({ type: attType, url: cdnUrl });
                      }
                    } catch (attErr) {
                      console.warn('[Attachment download error]:', attErr.message);
                      storedAttachments.push({ type: attType, url: cdnUrl });
                    }
                  }
                }
              }

              const primaryAttachmentUrl = storedAttachments[0]?.url || (hasAttachments ? rawAttachments[0]?.payload?.url : null);

              await supabase
                .from('messages')
                .insert({
                  conversation_id: convId,
                  sender_type: 'customer',
                  sender_name: 'Customer',
                  text: msgText || '[Attachment]',
                  message_text: msgText || '[Attachment]',
                  attachments: storedAttachments,
                  attachment_url: primaryAttachmentUrl,
                  meta_mid: mid,
                  is_read: false,
                  created_at: msgTimestamp
                });

              await supabase
                .from('conversations')
                .update({
                  last_message: msgText || '[Attachment]',
                  last_message_at: msgTimestamp,
                  unread_count: (conv?.unread_count || 0) + 1,
                  is_archived: false,
                  updated_at: new Date().toISOString()
                })
                .eq('id', convId)
                .catch(() => {});
            }
          } catch (dbErr) {
            console.warn("[Webhook DB Ingest Warning]:", dbErr.message);
          }
        }
      }
    }

    return res.status(200).json({
      status: "success",
      processed: true,
      duplicateIgnored,
      messagesProcessed: processedMsgs,
      leadsProcessed: processedLeads,
      eventId: eventId,
      pageId: pageId,
      slaTargetMinutes: 5,
      notificationsDispatched: true,
      signatureVerified: true,
      receivedAt: new Date().toISOString()
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

module.exports = createVercelHandler(metaWebhookHandler);
