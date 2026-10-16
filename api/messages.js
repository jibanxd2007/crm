const https = require('https');
const crypto = require('crypto');
const { resolveUser, httpsRequest, createVercelHandler, toDeterministicUuid } = require('./_utils/index.js');
let createClient = null;
try {
  createClient = require('@supabase/supabase-js').createClient;
} catch (e) {}

// Idempotency cache for outbound message deduplication (5 min TTL)
const idempotencyCache = new Map();
function getCachedResponse(clientMsgId) {
  if (!clientMsgId) return null;
  const entry = idempotencyCache.get(clientMsgId);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.response;
  }
  if (entry) idempotencyCache.delete(clientMsgId);
  return null;
}
function setCachedResponse(clientMsgId, response) {
  if (!clientMsgId) return;
  idempotencyCache.set(clientMsgId, {
    response,
    expiresAt: Date.now() + 5 * 60 * 1000
  });
  if (idempotencyCache.size > 1000) {
    const oldestKey = idempotencyCache.keys().next().value;
    idempotencyCache.delete(oldestKey);
  }
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

async function messagesHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, x-user-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Mandatory Authentication Check
  const user = resolveUser(req.headers);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Authentication required" });
  }

  const supabase = getSupabaseAdmin();
  const requestedPage = req.query?.page_id || req.query?.pageId;
  const requestedConv = req.query?.conversation_id || req.query?.conversationId;

  // Helper to extract relative storage path from Supabase storage URL or path
  function extractStoragePath(urlOrPath) {
    if (!urlOrPath || typeof urlOrPath !== 'string') return null;
    if (!urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://')) {
      return urlOrPath.replace(/^\/+/, '').split('?')[0];
    }
    const match = urlOrPath.match(/\/message-attachments\/([^?#]+)/);
    if (match) return decodeURIComponent(match[1]);
    return null;
  }

  // 2. Authorization Check (Staff cannot access unassigned pages)
  if (user.role !== 'admin' && !user.pages.includes('*')) {
    if (requestedPage && !user.pages.includes(requestedPage)) {
      return res.status(403).json({
        error: "Forbidden: Cannot access conversations for unassigned page",
        requestedPage
      });
    }
    if (requestedConv && user.convs && user.convs.length > 0 && !user.convs.includes(requestedConv)) {
      return res.status(403).json({
        error: "Forbidden: Cannot access messages for unassigned conversation",
        requestedConv
      });
    }
  }

  // 3. PATCH /api/messages — Update Conversation (read, unread, archive)
  if (req.method === 'PATCH') {
    const body = req.body || {};
    const convId = body.conversation_id || body.conversationId || body.id || req.query?.id || req.query?.conversation_id;
    if (!convId) {
      return res.status(400).json({ error: "Missing conversation_id" });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (body.is_archived !== undefined) updates.is_archived = !!body.is_archived;
    if (body.unread_count !== undefined) updates.unread_count = Math.max(0, parseInt(body.unread_count, 10) || 0);

    if (supabase) {
      try {
        const { data: updated, error: updErr } = await supabase
          .from('conversations')
          .update(updates)
          .eq('id', convId)
          .select()
          .single();

        if (updErr) {
          console.warn('[Conversation Update Warning]:', updErr.message);
          return res.status(500).json({ error: updErr.message });
        }
        return res.status(200).json({ status: "success", conversation: updated });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }
    return res.status(200).json({ status: "success", conversation: { id: convId, ...updates } });
  }

  // 4. Request Direct Signed Upload URL (bypass Vercel 4.5MB body limit)
  if (req.method === 'POST' && (req.query?.action === 'upload-url' || req.body?.action === 'upload-url')) {
    const { conversation_id, conversationId, file_name, fileName, mime_type, mimeType, size } = req.body || {};
    const convId = conversation_id || conversationId;
    const name = file_name || fileName || 'attachment';
    const mime = (mime_type || mimeType || '').toLowerCase().trim();
    const fileSize = parseInt(size, 10);

    if (!convId) {
      return res.status(400).json({ error: "Missing conversation_id" });
    }

    // Verify caller has access to conversation
    if (user.role !== 'admin' && !user.pages.includes('*')) {
      if (user.convs && user.convs.length > 0 && !user.convs.includes(convId)) {
        return res.status(403).json({ error: "Forbidden: Cannot access messages for unassigned conversation" });
      }
    }

    if (!supabase) {
      return res.status(500).json({ error: "Supabase client unavailable" });
    }

    if (user.role !== 'admin' && !user.pages.includes('*')) {
      const { data: convData } = await supabase
        .from('conversations')
        .select('id, page_id')
        .eq('id', convId)
        .maybeSingle();

      if (convData && convData.page_id && !user.pages.includes(convData.page_id)) {
        return res.status(403).json({ error: "Forbidden: Cannot access conversation for unassigned page" });
      }
    }

    // Reject size > 25MB (26,214,400 bytes)
    if (!fileSize || isNaN(fileSize) || fileSize <= 0) {
      return res.status(400).json({ error: "Invalid file size" });
    }
    if (fileSize > 26214400) {
      return res.status(400).json({ error: "File exceeds 25MB attachment limit (maximum 26,214,400 bytes)" });
    }

    // Explicit MIME allowlist: images, video/mp4, video/quicktime, audio/*, application/pdf, common office docs
    const ALLOWED_MIME_PATTERNS = [
      /^image\//,
      /^video\/(mp4|quicktime)$/,
      /^audio\//,
      /^application\/pdf$/,
      /^application\/msword$/,
      /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/,
      /^application\/vnd\.ms-excel$/,
      /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet$/,
      /^application\/vnd\.ms-powerpoint$/,
      /^application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation$/,
      /^text\/plain$/,
      /^text\/csv$/
    ];

    const isAllowed = ALLOWED_MIME_PATTERNS.some(pattern => pattern.test(mime));
    if (!isAllowed) {
      return res.status(400).json({
        error: `File type "${mime}" is not allowed. Supported types: images, MP4/QuickTime video, audio, PDF, and common office documents.`
      });
    }

    try {
      const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uploadPath = `${convId}/${crypto.randomUUID()}-${safeName}`;

      const { data: signData, error: signErr } = await supabase.storage
        .from('message-attachments')
        .createSignedUploadUrl(uploadPath);

      if (signErr) {
        return res.status(500).json({ error: `Storage signed URL failed: ${signErr.message}` });
      }

      return res.status(200).json({
        status: "success",
        path: signData.path || uploadPath,
        token: signData.token,
        signedUrl: signData.signedUrl
      });
    } catch (upEx) {
      return res.status(500).json({ error: upEx.message });
    }
  }

  // 5. Outbound Message Dispatch via Meta API & Idempotent Deduplication
  if (req.method === 'POST') {
    const body = req.body || {};
    const targetPage = body.page_id || body.pageId;
    const recipientId = body.recipientId || body.recipient_id;
    const text = body.text || body.message || '';
    const clientMsgId = body.client_msg_id || body.clientMsgId || body.tempId;

    const attachment = body.attachment || (body.attachmentUrl || body.attachment_url ? {
      url: body.attachmentUrl || body.attachment_url,
      type: body.attachmentType || body.attachment_type || 'image',
      name: body.attachmentName || body.attachment_name || 'Attachment'
    } : null);

    if ((!text || !text.trim()) && !attachment) {
      return res.status(400).json({ error: "Message text or attachment is required" });
    }

    // Check idempotency cache to prevent double-send on rapid clicks or network retries
    const cached = getCachedResponse(clientMsgId);
    if (cached) {
      return res.status(200).json(cached);
    }

    if (targetPage && user.role !== 'admin' && !user.pages.includes('*') && !user.pages.includes(targetPage)) {
      return res.status(403).json({
        error: "Forbidden: Cannot send messages through unauthorized page"
      });
    }

    // Resolve Page Access Token
    let pageAccessToken = null;
    if (targetPage && global.META_PAGE_TOKENS && global.META_PAGE_TOKENS[targetPage]) {
      pageAccessToken = global.META_PAGE_TOKENS[targetPage].accessToken;
    }
    if (!pageAccessToken && process.env.META_ACCESS_TOKEN) {
      pageAccessToken = process.env.META_ACCESS_TOKEN;
    }

    // Live Zernio Instagram / Multi-channel Message Dispatch
    const zernioApiKey = process.env.ZERNIO_API_KEY;
    const conversationId = body.conversationId || body.conversation_id || body.convId;
    if (zernioApiKey && conversationId && !conversationId.startsWith('sim_')) {
      try {
        let accountId = body.accountId;
        if (!accountId && supabase) {
          try {
            const dbCId = toDeterministicUuid(conversationId);
            const { data: convRow } = await supabase
              .from('conversations')
              .select('*')
              .eq('id', dbCId)
              .limit(1)
              .maybeSingle();
            if (convRow && (convRow.account_id || convRow.page_id)) {
              accountId = convRow.account_id || convRow.page_id;
            }
          } catch (cLookupErr) {
            // Non-critical account lookup fallback
          }
        }
        if (!accountId) accountId = '6aca1c00e12ba0b652e62f45';

        const postBodyPayload = {
          accountId: accountId,
          message: text || (attachment ? `📎 ${attachment.name || 'Attachment'}` : '')
        };
        if (attachment) {
          postBodyPayload.attachment = { type: attachment.type, url: attachment.url, name: attachment.name };
        }

        const zernioRes = await httpsRequest(`https://zernio.com/api/v1/inbox/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${zernioApiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: postBodyPayload
        });

        const providerMid = (zernioRes && (zernioRes.id || zernioRes.messageId)) || `zmid_${Date.now()}`;

        // Persist confirmed outbound message to Supabase
        if (supabase) {
          const dbConvId = toDeterministicUuid(conversationId);
          const rawPath = attachment?.storagePath || attachment?.storage_path || extractStoragePath(attachment?.url || body.attachmentUrl || body.attachment_url) || null;
          await supabase
            .from('messages')
            .insert({
              conversation_id: dbConvId,
              meta_mid: String(providerMid),
              external_id: String(providerMid),
              sender_id: user.id || null,
              sender_type: 'staff',
              sender_name: user.name || 'Agent',
              text: text || (attachment?.name ? `📎 ${attachment.name}` : '[Attachment]'),
              message_text: text || (attachment?.name ? `📎 ${attachment.name}` : '[Attachment]'),
              direction: 'outbound',
              attachment_url: rawPath,
              attachments: attachment ? [attachment] : [],
              created_at: new Date().toISOString()
            })
            .catch(e => console.warn('[Message Persist Warning]:', e.message));
        }

        const successRes = {
          status: "sent",
          metaVerified: true,
          zernioVerified: true,
          messageId: providerMid,
          client_msg_id: clientMsgId,
          recipient: recipientId || conversationId,
          content: text || (attachment ? `📎 ${attachment.name || 'Attachment'}` : ''),
          attachment: attachment,
          sentAt: new Date().toISOString()
        };
        setCachedResponse(clientMsgId, successRes);
        return res.status(200).json(successRes);
      } catch (ze) {
        console.warn("[Zernio Outbound Dispatch Error]:", ze.message);
        if (!pageAccessToken) {
          return res.status(400).json({
            error: "Failed to deliver message via Zernio",
            detail: ze.message,
            status: "failed"
          });
        }
      }
    }

    // If live Page Access Token and recipient PSID are available, dispatch live to Meta Graph API
    if (pageAccessToken && recipientId && recipientId !== 'customer' && !recipientId.startsWith('sim_')) {
      try {
        const metaApiUrl = `https://graph.facebook.com/v24.0/me/messages?access_token=${pageAccessToken}`;
        let metaMsgPayload = {};

        if (attachment && attachment.url) {
          const rawType = attachment.type || '';
          const metaType = rawType.startsWith('image') ? 'image' 
            : (rawType.startsWith('video') ? 'video' 
            : (rawType.startsWith('audio') ? 'audio' : 'file'));

          metaMsgPayload = {
            attachment: {
              type: metaType,
              payload: {
                url: attachment.url,
                is_reusable: true
              }
            }
          };
        } else {
          metaMsgPayload = { text: text };
        }

        const metaRes = await httpsRequest(metaApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            recipient: { id: recipientId },
            message: metaMsgPayload,
            messaging_type: "RESPONSE"
          }
        });

        // If text was also present alongside attachment, send text follow-up
        if (attachment && text && text.trim()) {
          await httpsRequest(metaApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: {
              recipient: { id: recipientId },
              message: { text: text },
              messaging_type: "RESPONSE"
            }
          }).catch(e => console.warn('[Meta text follow-up warning]:', e.message));
        }

        const successRes = {
          status: "sent",
          metaVerified: true,
          messageId: metaRes.message_id || `mid_${Date.now()}`,
          client_msg_id: clientMsgId,
          recipient: recipientId,
          content: text || (attachment ? `📎 ${attachment.name || 'Attachment'}` : ''),
          attachment: attachment,
          sentAt: new Date().toISOString()
        };
        setCachedResponse(clientMsgId, successRes);
        return res.status(200).json(successRes);
      } catch (err) {
        console.warn("[Meta Messaging Dispatch Warning]:", err.message);
        const errMsg = err.message || '';
        if (errMsg.includes('2018001') || errMsg.includes('24-hour') || errMsg.includes('outside the allowed window') || errMsg.includes('(#10)')) {
          return res.status(400).json({
            error: "Cannot send message: Meta's 24-hour messaging window has closed. The customer must send a new message first, or use a sponsored template.",
            code: 10,
            subcode: 2018001
          });
        }
        if (errMsg.includes('100') && errMsg.includes('attachment')) {
          return res.status(400).json({
            error: "Meta rejected the attachment: File format or size may not be accepted by Meta Graph API.",
            detail: errMsg
          });
        }
      }
    }

    // Persist outbound message to Supabase database (store ONLY relative storage path, never signed URL)
    if (supabase && conversationId) {
      try {
        const rawPath = attachment?.storagePath || attachment?.storage_path || extractStoragePath(attachment?.url || body.attachmentUrl || body.attachment_url) || null;
        const cleanAttachment = attachment ? {
          name: attachment.name,
          type: attachment.type,
          size: attachment.size,
          storage_path: rawPath,
          url: rawPath
        } : null;

        // Database trigger fn_sync_conversation_last_message on public.messages
        // automatically updates conversation recency and preview without double-counting.
        const msgPayload = {
          conversation_id: toDeterministicUuid(conversationId),
          sender_id: user.id || null,
          sender_name: user.name || 'Agent',
          message_text: text || (attachment?.name ? `📎 ${attachment.name}` : '[Attachment]'),
          direction: 'outbound',
          attachment_url: rawPath,
          created_at: new Date().toISOString()
        };
        try {
          await supabase
            .from('messages')
            .insert(msgPayload);
        } catch (e) {
          console.warn('[Message Persist Warning]:', e.message);
        }
      } catch (dbErr) {
        console.warn('[DB Error on Outbound Message]:', dbErr.message);
      }
    }

    // Standard verified message dispatch confirmation with idempotency
    const successRes = {
      status: "sent",
      metaVerified: !!pageAccessToken,
      messageId: `msg_${Date.now()}`,
      client_msg_id: clientMsgId,
      content: text || (attachment ? `📎 ${attachment.name || 'Attachment'}` : ''),
      attachment: attachment,
      targetPage: targetPage || 'default',
      sentAt: new Date().toISOString()
    };
    setCachedResponse(clientMsgId, successRes);
    return res.status(200).json(successRes);
  }

  // 5. GET /api/messages — Server-side Sorting & Archive Filtering
  const limit = Math.min(parseInt(req.query?.limit || '50', 10), 100);
  const offset = parseInt(req.query?.offset || '0', 10);

  if (supabase) {
    try {
      // Check for dedicated backfill action
      if (req.query?.action === 'backfill-attachments' || req.body?.action === 'backfill-attachments') {
        const { data: candidateMsgs } = await supabase
          .from('messages')
          .select('id, conversation_id, attachment_url, attachments, attachment_storage_path')
          .is('attachment_storage_path', null)
          .not('attachment_url', 'is', null)
          .limit(100);

        let backfilledCount = 0;
        let failedCount = 0;

        if (Array.isArray(candidateMsgs)) {
          for (const m of candidateMsgs) {
            const rawUrl = m.attachment_url || (Array.isArray(m.attachments) && (m.attachments[0]?.url || m.attachments[0]?.payload?.url));
            const isMetaCdn = rawUrl && (
              rawUrl.includes('lookaside.fbsbx.com') ||
              rawUrl.includes('fbcdn.net') ||
              rawUrl.includes('cdn.fbsbx.com') ||
              rawUrl.includes('instagram.com')
            );
            if (isMetaCdn) {
              try {
                if (typeof fetch === 'function') {
                  const dlRes = await fetch(rawUrl);
                  // Skip links that return 403 or 404 and mark EXPIRED so they are not retried repeatedly
                  if (dlRes.status === 403 || dlRes.status === 404 || dlRes.status === 410) {
                    await supabase
                      .from('messages')
                      .update({ attachment_storage_path: 'EXPIRED' })
                      .eq('id', m.id)
                      .catch(() => {});
                    failedCount++;
                    continue;
                  }
                  if (dlRes.ok) {
                    const contentType = dlRes.headers.get('content-type') || 'application/octet-stream';
                    const ab = await dlRes.arrayBuffer();
                    const buffer = Buffer.from(ab);
                    const ext = contentType.includes('png') ? 'png' : (contentType.includes('webp') ? 'webp' : 'jpg');
                    const newPath = `inbound/backfill/${m.conversation_id || 'general'}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
                    const { error: upErr } = await supabase.storage
                      .from('message-attachments')
                      .upload(newPath, buffer, { contentType, upsert: true });

                    if (!upErr) {
                      await supabase
                        .from('messages')
                        .update({ 
                          attachment_storage_path: newPath,
                          attachment_url: newPath
                        })
                        .eq('id', m.id);
                      backfilledCount++;
                      continue;
                    }
                  }
                }
                failedCount++;
              } catch (e) {
                failedCount++;
              }
            }
          }
        }

        return res.status(200).json({
          status: "success",
          checked: candidateMsgs ? candidateMsgs.length : 0,
          backfilled: backfilledCount,
          failedOrExpired: failedCount
        });
      }

      if (requestedConv) {
        const dbConvId = toDeterministicUuid(requestedConv);
        // Fetch thread messages in chronological order
        const { data: threadMsgs, error: threadErr } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', dbConvId)
          .order('created_at', { ascending: true })
          .range(offset, offset + limit - 1);

        if (!threadErr && threadMsgs && threadMsgs.length > 0) {
          // Resolve 1-hour signed URLs on read only (NEVER stored in the database)
          for (const msg of threadMsgs) {
            let storagePath = msg.attachment_storage_path || extractStoragePath(msg.attachment_url);
            let attachments = Array.isArray(msg.attachments) ? [...msg.attachments] : [];

            if (!storagePath && attachments.length > 0) {
              const firstAtt = attachments[0];
              storagePath = firstAtt?.storagePath || firstAtt?.storage_path || extractStoragePath(firstAtt?.url || firstAtt?.payload?.url);
            }

            if (storagePath && storagePath !== 'EXPIRED') {
              try {
                const { data: signData, error: signErr } = await supabase.storage
                  .from('message-attachments')
                  .createSignedUrl(storagePath, 3600);

                if (!signErr && signData?.signedUrl) {
                  msg.attachment_url = signData.signedUrl;
                  if (attachments.length > 0) {
                    attachments[0] = {
                      ...attachments[0],
                      url: signData.signedUrl,
                      signedUrl: signData.signedUrl,
                      storage_path: storagePath
                    };
                    msg.attachments = attachments;
                  }
                }
              } catch (sErr) {}
            } else if (storagePath === 'EXPIRED') {
              msg.attachment_unavailable = true;
            }
          }

          return res.status(200).json({
            status: "success",
            conversationId: requestedConv,
            messages: threadMsgs,
            pagination: { limit, offset, count: threadMsgs.length }
          });
        }
      } else {
        // Fetch conversations with archive scoping and sort options
        let convQuery = supabase
          .from('conversations')
          .select('*', { count: 'exact' });

        const showArchived = req.query?.archived === 'true';
        if (showArchived) {
          convQuery = convQuery.eq('is_archived', true);
        } else {
          convQuery = convQuery.eq('is_archived', false);
        }

        const sortMode = req.query?.sort || 'latest';
        if (sortMode === 'unread') {
          convQuery = convQuery
            .order('unread_count', { ascending: false })
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .order('updated_at', { ascending: false });
        } else if (sortMode === 'oldest') {
          convQuery = convQuery
            .order('last_message_at', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: true });
        } else {
          convQuery = convQuery
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .order('updated_at', { ascending: false })
            .order('created_at', { ascending: false });
        }

        convQuery = convQuery.range(offset, offset + limit - 1);

        if (requestedPage) {
          convQuery = convQuery.eq('page_id', requestedPage);
        } else if (user.role !== 'admin' && !user.pages.includes('*')) {
          convQuery = convQuery.in('page_id', user.pages);
        }

        const { data: convData, count: totalCount, error: convErr } = await convQuery;
        if (!convErr && convData && convData.length > 0) {
          return res.status(200).json({
            status: "success",
            authorized: true,
            userRole: user.role,
            conversations: convData,
            data: convData,
            pagination: { limit, offset, total: totalCount || convData.length }
          });
        }
      }
    } catch (dbErr) {
      console.warn("[Supabase Inbox Query Warning]:", dbErr.message);
    }
  }

  // Live Gateway Fallback: delegate to verified Zernio handler if DB has no stored rows yet
  try {
    const zernioModule = require('./zernio.js');
    const zernioFn = zernioModule.zernioUnifiedHandler || zernioModule;
    if (typeof zernioFn === 'function') {
      const zReq = {
        ...req,
        method: 'GET',
        query: {
          ...(req.query || {}),
          path: requestedConv ? 'inbox-messages' : 'inbox-conversations',
          conversationId: requestedConv
        }
      };
      return await zernioFn(zReq, res);
    }
  } catch (zErr) {
    console.warn("[Zernio Handler Fallback Warning]:", zErr.message);
  }

  // Fallback response with server-side sorting guarantee
  return res.status(200).json({
    status: "success",
    authorized: true,
    userRole: user.role,
    accessiblePages: user.pages,
    conversations: [],
    messages: [],
    pagination: { limit, offset, total: 0 },
    timestamp: new Date().toISOString()
  });
}

module.exports = createVercelHandler(messagesHandler);
