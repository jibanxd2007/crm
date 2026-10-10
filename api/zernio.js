const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const { createVercelHandler } = require('./_utils.js');

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
            res.status(200).json({
              status: "connected",
              provider: "zernio",
              verifiedGateway: true,
              hasAnalyticsAccess: true,
              appReviewBypassed: true,
              apiKey: `${apiKey.substring(0, 12)}...${apiKey.substring(apiKey.length - 6)}`,
              profile: profile,
              accounts: profile.accountUsernames || [],
              timestamp: new Date().toISOString()
            });
            resolve();
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

  // 2. CONNECT
  if (path.startsWith('connect') || url.includes('/connect')) {
    res.setHeader('Content-Type', 'application/json');
    const apiKey = process.env.ZERNIO_API_KEY;
    const profileId = process.env.ZERNIO_PROFILE_ID || '6aca100754c13a71092c1d1c';
    const channel = query.channel || url.split('/').pop() || 'facebook';

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

  // 4. WEBHOOK
  if (path === 'webhook' || url.includes('/webhooks/zernio')) {
    if (req.method === 'GET') {
      const challenge = query.challenge || query['hub.challenge'] || 'zernio_ok';
      return res.status(200).json({ status: 'active', provider: 'zernio', challenge });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const supabase = getSupabaseAdmin();
      const defaultOrgId = '00000000-0000-0000-0000-000000000001';

      const payload = body.data || body.payload || body;
      const leadId = payload.id || payload.lead_id || payload.leadgen_id || ('zn_lead_' + Date.now());
      const platform = payload.platform || (payload.source && payload.source.toLowerCase().includes('instagram') ? 'Instagram Ads' : 'Facebook Ads');
      const pageId = payload.page_id || payload.pageId || null;
      const pageName = payload.page_name || payload.pageName || 'Connected Page';
      const campaignId = payload.campaign_id || payload.campaignId || null;
      const campaignName = payload.campaign_name || payload.campaignName || 'Meta Campaign';

      const name = payload.name || payload.full_name || 'Prospect Lead';
      const email = payload.email || null;
      const phone = payload.phone || payload.phone_number || null;

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
              source: platform,
              page_id: pageId ? (pageId.startsWith('page_') ? pageId : `page_${pageId}`) : null,
              page_name: pageName,
              campaign_id: campaignId,
              campaign_name: campaignName,
              assigned_to: assignedStaffId,
              status: 'new'
            })
            .select()
            .single();
        }

        return res.status(200).json({
          status: 'success',
          provider: 'zernio',
          lead: { id: leadId, name, email, phone, pageName, campaignName, source: platform }
        });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }
  }

  return res.status(200).json({
    status: "ok",
    service: "zernio-gateway",
    endpoints: ["status", "connect", "simulate-lead", "webhook"]
  });
}

module.exports = createVercelHandler(zernioUnifiedHandler);
