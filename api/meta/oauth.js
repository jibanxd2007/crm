const { httpsRequest, createVercelHandler } = require('../_utils.js');

async function metaOAuthUnifiedHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = req.query || {};
  const isCallback = Boolean(query.code || query.error || (req.url && req.url.includes('/callback')));

  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;

  const host = req.headers['x-forwarded-host'] || req.headers.host || process.env.VERCEL_URL || "localhost:3000";
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = process.env.META_REDIRECT_URI || `${proto}://${host}/api/meta/callback`;

  // --------------------------------------------------------------------------
  // A. CALLBACK MODE: Exchange code for tokens, subscribe webhooks, redirect
  // --------------------------------------------------------------------------
  if (isCallback) {
    const code = query.code;
    const error = query.error;
    const errorDesc = query.error_description;

    if (error) {
      const errorMsg = errorDesc || error || 'Facebook authorization cancelled';
      return res.redirect(`/#connections?meta_auth=error&msg=${encodeURIComponent(errorMsg)}`);
    }

    if (!code) {
      return res.redirect(`/#connections?meta_auth=error&msg=${encodeURIComponent('No authorization code received from Facebook')}`);
    }

    if (!clientId || !clientSecret) {
      return res.redirect(`/#connections?meta_auth=error&msg=${encodeURIComponent('META_APP_ID or META_APP_SECRET is not configured in Vercel environment variables')}`);
    }

    try {
      // 1. Exchange code for short-lived user token
      const tokenExchangeUrl = `https://graph.facebook.com/v24.0/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
      const tokenRes = await httpsRequest(tokenExchangeUrl);

      if (!tokenRes.access_token) {
        throw new Error("Facebook did not return an access token.");
      }

      const shortLivedToken = tokenRes.access_token;
      let userToken = shortLivedToken;

      // 2. Exchange for long-lived user access token (60 days)
      try {
        const longLivedUrl = `https://graph.facebook.com/v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${shortLivedToken}`;
        const longLivedRes = await httpsRequest(longLivedUrl);
        if (longLivedRes.access_token) {
          userToken = longLivedRes.access_token;
        }
      } catch (e) {
        console.warn("[Meta OAuth] Could not upgrade to long-lived token, using short-lived:", e.message);
      }

      // 3. Fetch Managed Pages & Connected Instagram Accounts
      const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?fields=id,name,access_token,category,picture{url},instagram_business_account{id,username}&access_token=${userToken}`;
      const pagesRes = await httpsRequest(pagesUrl);
      const pagesList = pagesRes.data || [];

      if (pagesList.length === 0) {
        return res.redirect('/#connections?meta_auth=no_pages');
      }

      // 4. Auto-subscribe each Page to webhooks & store page tokens securely
      const subscribedPages = [];
      if (!global.META_PAGE_TOKENS) global.META_PAGE_TOKENS = {};

      for (const page of pagesList) {
        global.META_PAGE_TOKENS[page.id] = {
          pageId: page.id,
          pageName: page.name,
          accessToken: page.access_token,
          savedAt: new Date().toISOString()
        };

        try {
          const subUrl = `https://graph.facebook.com/v24.0/${page.id}/subscribed_apps?subscribed_fields=leadgen,messages,messaging_postbacks&access_token=${page.access_token}`;
          await httpsRequest(subUrl, { method: 'POST' });
        } catch (subErr) {
          console.warn(`[Meta Webhooks] Subscription warning for page ${page.name}:`, subErr.message);
        }

        subscribedPages.push({
          id: page.id,
          name: page.name,
          category: page.category || 'Business',
          picture: page.picture?.data?.url || null,
          instagram: page.instagram_business_account ? {
            id: page.instagram_business_account.id,
            username: page.instagram_business_account.username
          } : null
        });
      }

      // 5. Persist to Supabase if configured
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && serviceRoleKey) {
        try {
          const cleanSupabaseUrl = supabaseUrl.replace(/\/$/, '');
          for (const page of pagesList) {
            const upsertUrl = `${cleanSupabaseUrl}/rest/v1/facebook_pages`;
            await httpsRequest(upsertUrl, {
              method: 'POST',
              headers: {
                'apikey': serviceRoleKey,
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
              },
              body: {
                page_id: page.id,
                page_name: page.name,
                page_access_token: page.access_token,
                instagram_business_account_id: page.instagram_business_account?.id || null,
                is_active: true,
                updated_at: new Date().toISOString()
              }
            });
          }
        } catch (dbErr) {
          console.warn("[Supabase] Page persistence note:", dbErr.message);
        }
      }

      const primaryPage = subscribedPages[0];
      const encodedName = encodeURIComponent(primaryPage.name);
      const encodedId = encodeURIComponent(primaryPage.id);

      return res.redirect(`/#connections?meta_auth=success&page_name=${encodedName}&page_id=${encodedId}&pages_count=${subscribedPages.length}`);

    } catch (err) {
      console.error("[Meta OAuth Callback Error]:", err.message);
      const failMsg = err.message || 'Token exchange failed';
      return res.redirect(`/#connections?meta_auth=error&msg=${encodeURIComponent(failMsg)}`);
    }
  }

  // --------------------------------------------------------------------------
  // B. URL GENERATION MODE: Return OAuth Dialog URL
  // --------------------------------------------------------------------------
  if (!clientId) {
    return res.status(500).json({
      error: "META_APP_ID is not configured in environment variables.",
      help: "Please set META_APP_ID in your Vercel Project Settings -> Environment Variables."
    });
  }

  const state = query.state || Math.random().toString(36).substring(7);
  const scopes = [
    "public_profile",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_metadata",
    "pages_messaging",
    "leads_retrieval",
    "instagram_basic",
    "instagram_manage_messages"
  ].join(",");

  const oauthUrl = `https://www.facebook.com/v24.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scopes)}&response_type=code`;

  if (query.redirect === 'true') {
    return res.redirect(oauthUrl);
  }

  return res.status(200).json({
    status: "success",
    url: oauthUrl,
    clientId: clientId,
    redirectUri: redirectUri,
    state: state
  });
}

module.exports = createVercelHandler(metaOAuthUnifiedHandler);
