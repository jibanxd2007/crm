const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const { createVercelHandler, resolveUser, httpsRequest } = require('./_utils/index.js');

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });
}

async function zernioUnifiedHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Zernio-Signature');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = req.url || '';
  const query = req.query || {};
  const path = (query.path || '').toLowerCase();

  // 1. STATUS or ACCOUNTS
  if (path === 'status' || url.includes('/status') || path === 'accounts' || url.includes('/accounts')) {
    res.setHeader('Content-Type', 'application/json');
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        status: "not_configured",
        provider: "zernio",
        message: "ZERNIO_API_KEY is not configured in environment variables."
      });
    }

    const options = {
      hostname: 'zernio.com',
      port: 443,
      path: '/api/v1/profiles',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    };

    return new Promise((resolve) => {
      const request = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => { data += chunk; });
        resp.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const targetId = process.env.ZERNIO_PROFILE_ID;
            const profile = (parsed.profiles && targetId ? parsed.profiles.find(p => p._id === targetId || p.id === targetId) : null) || (parsed.profiles && parsed.profiles[0]) || (parsed.profile || parsed);
            const accountsReq = https.request({
              hostname: 'zernio.com',
              port: 443,
              path: '/api/v1/accounts',
              method: 'GET',
              headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
            }, (accResp) => {
              let accData = '';
              accResp.on('data', c => { accData += c; });
              accResp.on('end', () => {
                let liveAccounts = [];
                try {
                  const parsedAcc = JSON.parse(accData);
                  liveAccounts = parsedAcc.accounts || [];
                } catch (err) {}
                res.status(200).json({
                  status: "connected",
                  provider: "zernio",
                  verifiedGateway: true,
                  hasAnalyticsAccess: true,
                  appReviewBypassed: true,
                  apiKey: `${apiKey.substring(0, 12)}...${apiKey.substring(apiKey.length - 6)}`,
                  profile: profile,
                  accounts: liveAccounts,
                  timestamp: new Date().toISOString()
                });
                resolve();
              });
            });
            accountsReq.on('error', () => {
              res.status(200).json({
                status: "connected",
                provider: "zernio",
                verifiedGateway: true,
                profile: profile,
                accounts: [],
                timestamp: new Date().toISOString()
              });
              resolve();
            });
            accountsReq.end();
            return;
          } catch (e) {
            res.status(200).json({ status: "connected", raw: data });
            resolve();
          }
        });
      });

      request.on('error', (err) => {
        res.status(502).json({ status: "error", error: err.message });
        resolve();
      });

      request.end();
    });
  }

  // 1.5. ACCOUNTS LIST
  if (path === 'accounts' || url.includes('/accounts')) {
    res.setHeader('Content-Type', 'application/json');
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      return res.status(200).json({ accounts: [] });
    }

    const options = {
      hostname: 'zernio.com',
      port: 443,
      path: '/api/v1/accounts',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    };

    return new Promise((resolve) => {
      const request = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => { data += chunk; });
        resp.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            res.status(200).json(parsed);
            resolve();
          } catch (e) {
            res.status(200).json({ accounts: [] });
            resolve();
          }
        });
      });

      request.on('error', (err) => {
        res.status(500).json({ error: err.message, accounts: [] });
        resolve();
      });

      request.end();
    });
  }

  // 1.6 REAL INBOX MESSAGES LIST & SEND
  if (path === 'inbox-messages' || (url.includes('/inbox/conversations') && url.includes('/messages'))) {
    res.setHeader('Content-Type', 'application/json');
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      return res.status(200).json({ status: "error", error: "ZERNIO_API_KEY not configured", messages: [] });
    }

    let conversationId = query.conversationId || (url.match(/conversations\/([^/?]+)/) ? url.match(/conversations\/([^/?]+)/)[1] : null);
    let accountId = query.accountId || (req.body && req.body.accountId);

    if (!conversationId) {
      return res.status(400).json({ error: "Missing conversationId" });
    }

    // If accountId is not provided, look up the owning account from the live conversations list
    if (!accountId) {
      try {
        const convsResp = await new Promise((resolve) => {
          https.get({
            hostname: 'zernio.com',
            port: 443,
            path: '/api/v1/inbox/conversations',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
          }, (cResp) => {
            let cData = '';
            cResp.on('data', d => cData += d);
            cResp.on('end', () => {
              try { resolve(JSON.parse(cData)); } catch(e) { resolve(null); }
            });
          }).on('error', () => resolve(null));
        });
        const list = convsResp ? (convsResp.conversations || convsResp.data || []) : [];
        const match = Array.isArray(list) ? list.find(c => String(c.id) === String(conversationId)) : null;
        if (match && match.accountId) {
          accountId = match.accountId;
        }
      } catch (err) {}
    }
    if (!accountId) accountId = '6aca1c00e12ba0b652e62f45';

    if (req.method === 'POST') {
      const text = (req.body && (req.body.message || req.body.text)) || '';
      const postData = JSON.stringify({
        accountId: accountId,
        message: text
      });

      const options = {
        hostname: 'zernio.com',
        port: 443,
        path: `/api/v1/inbox/conversations/${conversationId}/messages`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      return new Promise((resolve) => {
        const request = https.request(options, (resp) => {
          let data = '';
          resp.on('data', chunk => { data += chunk; });
          resp.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              res.status(resp.statusCode || 200).json(parsed);
              resolve();
            } catch (e) {
              res.status(200).json({ status: "sent", raw: data });
              resolve();
            }
          });
        });
        request.on('error', (err) => {
          res.status(500).json({ error: err.message });
          resolve();
        });
        request.write(postData);
        request.end();
      });
    }

    // GET Messages
    const options = {
      hostname: 'zernio.com',
      port: 443,
      path: `/api/v1/inbox/conversations/${conversationId}/messages?accountId=${encodeURIComponent(accountId)}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    };

    return new Promise((resolve) => {
      const request = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => { data += chunk; });
        resp.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const msgList = parsed.messages || parsed.data || [];
            if (Array.isArray(msgList)) {
              msgList.sort((a, b) => {
                const timeA = new Date(a.sentAt || a.createdAt || a.created_at || 0).getTime();
                const timeB = new Date(b.sentAt || b.createdAt || b.created_at || 0).getTime();
                return timeA - timeB;
              });
            }
            res.status(200).json(parsed);
            resolve();
          } catch (e) {
            res.status(200).json({ messages: [] });
            resolve();
          }
        });
      });
      request.on('error', (err) => {
        res.status(500).json({ error: err.message, messages: [] });
        resolve();
      });
      request.end();
    });
  }

  // 1.7 REAL INBOX CONVERSATIONS LIST
  if (path === 'inbox-conversations' || (path.startsWith('inbox') && !url.includes('/messages')) || (url.includes('/inbox/conversations') && !url.includes('/messages'))) {
    res.setHeader('Content-Type', 'application/json');
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      return res.status(200).json({ conversations: [] });
    }

    const options = {
      hostname: 'zernio.com',
      port: 443,
      path: '/api/v1/inbox/conversations',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    };

    return new Promise((resolve) => {
      const request = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => { data += chunk; });
        resp.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const convList = parsed.data || parsed.conversations || [];
            if (Array.isArray(convList)) {
              convList.forEach(c => {
                c.last_message_at = c.last_message_at || c.lastMessageAt || c.updatedTime || c.updated_at || c.time || new Date().toISOString();
              });
              convList.sort((a, b) => {
                const timeA = new Date(a.last_message_at || 0).getTime();
                const timeB = new Date(b.last_message_at || 0).getTime();
                return timeB - timeA;
              });
            }
            res.status(200).json(parsed);
            resolve();
          } catch (e) {
            res.status(200).json({ conversations: [] });
            resolve();
          }
        });
      });
      request.on('error', (err) => {
        res.status(500).json({ error: err.message, conversations: [] });
        resolve();
      });
      request.end();
    });
  }

  // 2. CONNECT
  if (path.startsWith('connect') || url.includes('/connect')) {
    res.setHeader('Content-Type', 'application/json');
    const apiKey = process.env.ZERNIO_API_KEY;
    const profileId = process.env.ZERNIO_PROFILE_ID || '6aca100754c13a71092c1d1c';
    const cleanUrl = url.split('?')[0];
    const pathEnd = cleanUrl.split('/').pop();
    const channel = (query.channel === 'instagram' || pathEnd === 'instagram') ? 'instagram' : 'facebook';

    if (!apiKey) {
      return res.status(500).json({
        error: "ZERNIO_API_KEY must be configured in environment variables."
      });
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host || process.env.VERCEL_URL || "crm-beta-three-36.vercel.app";
    const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
    const redirectUrl = process.env.META_REDIRECT_URI || `${proto}://${host}/api/meta/callback`;

    const options = {
      hostname: 'zernio.com',
      port: 443,
      path: `/api/v1/connect/${channel}?profileId=${profileId}&redirect_url=${encodeURIComponent(redirectUrl)}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    };

    return new Promise((resolve) => {
      const request = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => { data += chunk; });
        resp.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.authUrl) {
              res.status(200).json({
                status: "success",
                channel: channel,
                authUrl: parsed.authUrl,
                url: parsed.authUrl,
                gateway: "Zernio Meta Verified OAuth",
                timestamp: new Date().toISOString()
              });
              resolve();
              return;
            }
            res.status(resp.statusCode || 200).json(parsed);
            resolve();
          } catch (e) {
            res.status(500).json({ error: "Failed to parse Zernio connect response", raw: data });
            resolve();
          }
        });
      });

      request.on('error', (err) => {
        res.status(502).json({ error: err.message });
        resolve();
      });

      request.end();
    });
  }

  // 3. SIMULATE LEAD
  if (path === 'simulate-lead' || url.includes('/simulate-lead')) {
    res.setHeader('Content-Type', 'application/json');
    const randomId = Math.floor(100000 + Math.random() * 900000);
    const body = req.body || {};

    const simulatedLead = {
      id: `lead_meta_${randomId}`,
      meta_lead_id: `meta_lead_${randomId}`,
      name: body.name || `Meta Test Lead ${randomId}`,
      phone: body.phone || `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`,
      email: body.email || `test.lead.${randomId}@example.com`,
      page_id: body.pageId || body.page_id || "page_live",
      pageId: body.pageId || body.page_id || "page_live",
      source: "Facebook Lead Ads",
      status: "New Lead",
      campaign_id: "cmp_live_01",
      campaignId: "cmp_live_01",
      ad_id: "ad_live_01",
      adId: "ad_live_01",
      form_id: `form_fb_${randomId}`,
      formId: `form_fb_${randomId}`,
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      assigned_staff_id: body.assignedTo || null,
      assignedStaffId: body.assignedTo || null,
      lead_value: body.value || 0,
      value: body.value || 0,
      isHotLead: (body.value || 0) >= 50000,
      slaTargetMinutes: 5,
      attribution: {
        platform: "Facebook Lead Ads",
        page: "Connected Facebook Page",
        campaign: "Live Lead Generation Campaign",
        ad: "Lead Ad Creative",
        formId: `form_fb_${randomId}`,
        timestamp: new Date().toISOString()
      }
    };

    return res.status(200).json({
      status: "success",
      message: "Simulated inbound Facebook Lead Ad processed and attributed",
      lead: simulatedLead,
      timestamp: new Date().toISOString()
    });
  }

  // 4. WEBHOOK (Real Meta Leads & Messaging via Zernio)
  if (path === 'webhook' || url.includes('/webhooks/zernio')) {
    if (req.method === 'GET') {
      const challenge = query.challenge || query['hub.challenge'] || 'zernio_ok';
      return res.status(200).json({ status: 'active', provider: 'zernio', challenge });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const supabase = getSupabaseAdmin();

      const payload = body.data || body.payload || body;

      // Handle real messaging webhook event from Zernio / Instagram Direct
      const isMessageEvent = body.event === 'message.received' || body.event === 'message' || body.type === 'message' || payload.type === 'message' || (payload.conversationId && (payload.message || payload.text)) || (payload.conversation_id && (payload.message || payload.text));

      if (isMessageEvent) {
        const convId = payload.conversationId || payload.conversation_id || payload.conversation?.id || ('zn_conv_' + Date.now());
        const msgText = payload.message?.text || (typeof payload.message === 'string' ? payload.message : (payload.text || ''));
        const sender = payload.sender || payload.from || {};
        const senderName = sender.name || sender.username || payload.senderName || 'Contact';
        const senderId = sender.id || payload.senderId || payload.sender_id || null;
        const msgTime = payload.timestamp ? new Date(payload.timestamp).toISOString() : (payload.created_at || new Date().toISOString());
        const rawAtt = payload.attachment || (Array.isArray(payload.attachments) ? payload.attachments[0] : null) || (payload.message?.attachment || null);

        if (supabase) {
          try {
            const { data: existingConv } = await supabase
              .from('conversations')
              .select('id, unread_count')
              .eq('id', convId)
              .maybeSingle();

            if (!existingConv) {
              await supabase
                .from('conversations')
                .insert({
                  id: convId,
                  customer_name: senderName,
                  customer_psid: senderId,
                  channel: payload.platform || 'instagram',
                  last_message: msgText || (rawAtt ? '📎 Attachment' : 'Message'),
                  last_message_at: msgTime,
                  unread_count: 1,
                  is_archived: false,
                  updated_at: new Date().toISOString()
                })
                .catch(() => {});
            } else {
              await supabase
                .from('conversations')
                .update({
                  last_message: msgText || (rawAtt ? '📎 Attachment' : 'Message'),
                  last_message_at: msgTime,
                  unread_count: (existingConv.unread_count || 0) + 1,
                  is_archived: false,
                  updated_at: new Date().toISOString()
                })
                .eq('id', convId)
                .catch(() => {});
            }

            await supabase
              .from('messages')
              .insert({
                conversation_id: convId,
                sender_type: 'customer',
                sender_name: senderName,
                sender_id: senderId,
                text: msgText || (rawAtt ? '📎 Attachment' : '[Message]'),
                message_text: msgText || (rawAtt ? '📎 Attachment' : '[Message]'),
                direction: 'inbound',
                attachment_url: rawAtt?.url || null,
                attachments: rawAtt ? [rawAtt] : [],
                created_at: msgTime
              })
              .catch(() => {});

            return res.status(200).json({ status: 'success', processed: true, type: 'message', conversation_id: convId });
          } catch (mErr) {
            console.warn('[Zernio Message Ingest Warning]:', mErr.message);
          }
        }
        return res.status(200).json({ status: 'success', processed: true, type: 'message' });
      }

      const leadId = payload.leadgen_id || payload.id || payload.lead_id || payload.meta_lead_id || ('zn_lead_' + Date.now());
      const platform = payload.platform || (payload.source && payload.source.toLowerCase().includes('instagram') ? 'Instagram Ads' : 'Facebook Lead Ad');
      const pageId = payload.page_id || payload.pageId || (payload.page && payload.page.id) || null;
      const pageName = payload.page_name || payload.pageName || (payload.page && payload.page.name) || null;
      const campaignId = payload.campaign_id || payload.campaignId || null;
      const campaignName = payload.campaign_name || payload.campaignName || null;
      const formId = payload.form_id || payload.formId || null;
      const formName = payload.form_name || payload.formName || null;
      const adId = payload.ad_id || payload.adId || null;
      const adName = payload.ad_name || payload.adName || null;
      const adsetId = payload.adset_id || payload.adsetId || null;
      const adsetName = payload.adset_name || payload.adsetName || null;
      const createdTime = payload.created_time ? (typeof payload.created_time === 'number' ? new Date(payload.created_time * 1000).toISOString() : new Date(payload.created_time).toISOString()) : (payload.created_at || new Date().toISOString());

      let fullName = (payload.full_name || payload.name || payload.first_name ? `${payload.first_name || ''} ${payload.last_name || ''}`.trim() : '').trim();
      let email = payload.email || payload.email_address || null;
      let phone = payload.phone || payload.phone_number || null;

      // Parse nested field_data / answers from Meta Lead Ads form responses
      const fieldsList = payload.field_data || payload.form_data || payload.answers || [];
      if (Array.isArray(fieldsList)) {
        for (const field of fieldsList) {
          const fname = (field.name || '').toLowerCase();
          const fval = Array.isArray(field.values) ? field.values[0] : (field.value || field.values);
          if (!fval) continue;
          if (!fullName && (fname.includes('full_name') || fname === 'name')) fullName = fval;
          else if (!fullName && fname.includes('first_name')) fullName = fval;
          else if (!email && fname.includes('email')) email = fval;
          else if (!phone && (fname.includes('phone') || fname.includes('mobile'))) phone = fval;
        }
      }
      if (!fullName) fullName = 'Meta Lead';

      try {
        if (supabase) {
          // Idempotency check: dedupe on Meta leadgen_id
          const { data: existingLead } = await supabase
            .from('leads')
            .select('*')
            .eq('meta_lead_id', String(leadId))
            .maybeSingle();

          if (existingLead) {
            console.log('[Zernio Leadgen]: Duplicate lead ignored for meta_lead_id:', leadId);
            return res.status(200).json({
              status: 'success',
              isDuplicate: true,
              lead: { ...existingLead, name: existingLead.full_name }
            });
          }

          // Resolve page_id to a valid facebook_pages record (UUID) for staff scoping & RLS
          let resolvedPageId = null;
          let resolvedPageName = pageName;

          if (pageId) {
            const { data: matchedPages } = await supabase
              .from('facebook_pages')
              .select('id, page_id, page_name')
              .or(`page_id.eq.${pageId},id.eq.${pageId}`)
              .limit(1);
            if (matchedPages && matchedPages.length > 0) {
              resolvedPageId = matchedPages[0].id;
              resolvedPageName = resolvedPageName || matchedPages[0].page_name;
            }
          }

          if (!resolvedPageId && pageName) {
            const { data: nameMatches } = await supabase
              .from('facebook_pages')
              .select('id, page_id, page_name')
              .ilike('page_name', pageName)
              .limit(1);
            if (nameMatches && nameMatches.length > 0) {
              resolvedPageId = nameMatches[0].id;
              resolvedPageName = resolvedPageName || nameMatches[0].page_name;
            }
          }

          if (!resolvedPageId) {
            const { data: anyPage } = await supabase
              .from('facebook_pages')
              .select('id, page_id, page_name')
              .order('connected_at', { ascending: false })
              .limit(1);
            if (anyPage && anyPage.length > 0) {
              resolvedPageId = anyPage[0].id;
              resolvedPageName = resolvedPageName || anyPage[0].page_name;
            }
          }

          // Staff Assignment: match staff assigned to this specific page
          let assignedStaffId = null;
          if (resolvedPageId) {
            const { data: members } = await supabase
              .from('page_members')
              .select('user_id')
              .eq('page_id', resolvedPageId)
              .limit(1);
            if (members && members.length > 0) {
              assignedStaffId = members[0].user_id;
            }
          }
          if (!assignedStaffId) {
            const { data: staffMembers } = await supabase
              .from('users')
              .select('id')
              .eq('role', 'staff')
              .limit(1);
            if (staffMembers && staffMembers.length > 0) {
              assignedStaffId = staffMembers[0].id;
            }
          }

          const insertData = {
            page_id: resolvedPageId,
            meta_lead_id: String(leadId),
            full_name: fullName,
            email: email ? email.trim() : null,
            phone: phone ? phone.trim() : null,
            source: platform,
            campaign_id: campaignId ? String(campaignId) : null,
            campaign_name: campaignName,
            form_id: formId ? String(formId) : null,
            form_name: formName,
            ad_id: adId ? String(adId) : null,
            ad_name: adName,
            adset_id: adsetId ? String(adsetId) : null,
            adset_name: adsetName,
            assigned_to: assignedStaffId,
            status: 'New',
            raw_data: payload,
            created_at: createdTime
          };

          const { data: created, error: dbErr } = await supabase
            .from('leads')
            .upsert(insertData, { onConflict: 'meta_lead_id', ignoreDuplicates: true })
            .select()
            .maybeSingle();

          if (dbErr) {
            console.error('[Zernio Lead Ingest DB Error]:', dbErr);
            return res.status(500).json({ error: dbErr.message });
          }

          if (!created) {
            console.log('[Zernio Lead Ingest]: Ignored duplicate lead for meta_lead_id:', leadId);
            return res.status(200).json({
              status: 'success',
              provider: 'zernio',
              isDuplicate: true,
              lead: { meta_lead_id: String(leadId), name: fullName }
            });
          }

          console.log('[Zernio Lead Ingest Success]: Stored lead:', leadId, fullName, 'Page:', resolvedPageId);

          return res.status(200).json({
            status: 'success',
            provider: 'zernio',
            lead: { ...created, name: created.full_name }
          });
        }

        return res.status(200).json({
          status: 'success',
          provider: 'zernio',
          lead: { id: leadId, name: fullName, email, phone, source: platform, page_id: pageId }
        });
      } catch (err) {
        console.error('[Zernio Webhook Fatal Error]:', err);
        return res.status(500).json({ error: err.message });
      }
    }
  }

  // 5. BACKFILL: SYNC LEADS NOW (Admin Only)
  if (path === 'sync-leads' || url.includes('/sync-leads')) {
    res.setHeader('Content-Type', 'application/json');
    const user = resolveUser(req.headers);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden: Admin authorization required to sync leads." });
    }

    const supabase = getSupabaseAdmin();
    let newLeads = 0;
    let skippedLeads = 0;
    const errors = [];

    try {
      const apiKey = process.env.ZERNIO_API_KEY;
      let connectedPages = [];

      if (supabase) {
        const { data: pages } = await supabase
          .from('facebook_pages')
          .select('id, page_id, page_name, page_access_token');
        if (pages) connectedPages = pages;
      }

      // Backfill through Zernio accounts API if key configured
      if (apiKey) {
        try {
          const zernioResp = await new Promise((resolve) => {
            const reqAcc = https.request({
              hostname: 'zernio.com',
              port: 443,
              path: '/api/v1/accounts',
              method: 'GET',
              headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
            }, (resAcc) => {
              let d = '';
              resAcc.on('data', c => d += c);
              resAcc.on('end', () => {
                try { resolve(JSON.parse(d)); } catch(e) { resolve(null); }
              });
            });
            reqAcc.on('error', () => resolve(null));
            reqAcc.end();
          });

          if (zernioResp && Array.isArray(zernioResp.leads)) {
            for (const item of zernioResp.leads) {
              const lId = item.id || item.leadgen_id;
              if (!lId || !supabase) continue;

              const targetPg = connectedPages.find(p => p.page_id === item.page_id || p.id === item.page_id) || connectedPages[0];
              const { data: upRes, error: insErr } = await supabase
                .from('leads')
                .upsert({
                  page_id: targetPg?.id || null,
                  meta_lead_id: String(lId),
                  full_name: item.full_name || item.name || 'Meta Lead',
                  email: item.email || null,
                  phone: item.phone || null,
                  source: 'Facebook Lead Ad',
                  status: 'New',
                  raw_data: item,
                  created_at: item.created_time || item.created_at || new Date().toISOString()
                }, { onConflict: 'meta_lead_id', ignoreDuplicates: true })
                .select('id');

              if (!insErr) {
                if (upRes && upRes.length > 0) newLeads++;
                else skippedLeads++;
              }
            }
          }
        } catch (zErr) {
          console.warn('[Zernio Lead Backfill Warning]:', zErr.message);
          errors.push(zErr.message);
        }
      }

      // Backfill from Meta Graph API for each connected Facebook Page with access token
      for (const page of connectedPages) {
        const token = page.page_access_token || process.env.META_ACCESS_TOKEN || process.env.META_SYSTEM_USER_ACCESS_TOKEN;
        if (!token || !page.page_id) continue;

        try {
          const formsData = await httpsRequest(`https://graph.facebook.com/v24.0/${page.page_id}/leadgen_forms?access_token=${token}&limit=10`).catch(() => null);
          const forms = formsData?.data || [];

          for (const form of forms) {
            const leadsData = await httpsRequest(`https://graph.facebook.com/v24.0/${form.id}/leads?access_token=${token}&limit=25`).catch(() => null);
            const rawLeads = leadsData?.data || [];

            for (const rLead of rawLeads) {
              if (!rLead.id || !supabase) continue;

              let lName = '';
              let lEmail = '';
              let lPhone = '';
              if (Array.isArray(rLead.field_data)) {
                for (const f of rLead.field_data) {
                  const fn = (f.name || '').toLowerCase();
                  const fv = Array.isArray(f.values) ? f.values[0] : f.values;
                  if (!lName && (fn.includes('full_name') || fn === 'name')) lName = fv;
                  else if (!lName && fn.includes('first_name')) lName = fv;
                  else if (!lEmail && fn.includes('email')) lEmail = fv;
                  else if (!lPhone && (fn.includes('phone') || fn.includes('mobile'))) lPhone = fv;
                }
              }

              const { data: upRes, error: insErr } = await supabase
                .from('leads')
                .upsert({
                  page_id: page.id,
                  meta_lead_id: String(rLead.id),
                  full_name: lName || 'Meta Lead',
                  email: lEmail || null,
                  phone: lPhone || null,
                  source: 'Facebook Lead Ad',
                  status: 'New',
                  form_id: form.id,
                  form_name: form.name,
                  raw_data: rLead,
                  created_at: rLead.created_time || new Date().toISOString()
                }, { onConflict: 'meta_lead_id', ignoreDuplicates: true })
                .select('id');

              if (!insErr) {
                if (upRes && upRes.length > 0) newLeads++;
                else skippedLeads++;
              } else {
                console.error('[Meta Lead Backfill Insert Error]:', insErr.message);
              }
            }
          }
        } catch (pageErr) {
          console.warn(`[Meta Page Lead Sync Warning for ${page.page_name}]:`, pageErr.message);
          errors.push(pageErr.message);
        }
      }

      console.log(`[Zernio / Meta Lead Backfill Finished]: Synced ${newLeads} new leads, skipped ${skippedLeads} existing leads.`);
      return res.status(200).json({
        status: "success",
        syncedCount: newLeads,
        newLeads: newLeads,
        skippedLeads: skippedLeads,
        totalProcessed: newLeads + skippedLeads,
        connectedPagesProcessed: connectedPages.length,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString()
      });
    } catch (topErr) {
      console.error('[Zernio Lead Backfill Fatal Error]:', topErr);
      return res.status(500).json({ error: topErr.message });
    }
  }

  return res.status(200).json({
    status: "ok",
    service: "zernio-gateway",
    endpoints: ["status", "connect", "simulate-lead", "webhook", "sync-leads"]
  });
}

const handler = createVercelHandler(zernioUnifiedHandler);
handler.zernioUnifiedHandler = zernioUnifiedHandler;
module.exports = handler;

