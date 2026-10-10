const { httpsRequest, createVercelHandler } = require('../_utils.js');

async function metaCallbackHandler(req, res) {
  const query = req.query || {};
  const code = query.code;
  const error = query.error;
  const errorDesc = query.error_description;

  // 1. Handle user cancellation or permission denial
  if (error) {
    const errorMsg = errorDesc || error || 'Facebook authorization cancelled';
    return res.redirect(`/#connections?meta_auth=error&msg=${encodeURIComponent(errorMsg)}`);
  }

  // 2. Validate authorization code
  if (!code) {
    return res.redirect(`/#connections?meta_auth=error&msg=${encodeURIComponent('No authorization code received from Facebook')}`);
  }

  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;

  if (!clientId || !clientSecret) {
    return res.redirect(`/#connections?meta_auth=error&msg=${encodeURIComponent('META_APP_ID or META_APP_SECRET is not configured in Vercel environment variables')}`);
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || process.env.VERCEL_URL || "localhost:3000";
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = process.env.META_REDIRECT_URI || `${proto}://${host}/api/meta/callback`;

  try {
    // 3. Step 1: Exchange code for short-lived user token
    const tokenExchangeUrl = `https://graph.facebook.com/v24.0/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
    const tokenRes = await httpsRequest(tokenExchangeUrl);

    if (!tokenRes.access_token) {
      throw new Error("Facebook did not return an access token.");
    }

    const shortLivedToken = tokenRes.access_token;

    // 4. Step 2: Exchange for long-lived user access token (60 days)
    let userToken = shortLivedToken;
    try {
      const longLivedUrl = `https://graph.facebook.com/v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${shortLivedToken}`;
      const longLivedRes = await httpsRequest(longLivedUrl);
      if (longLivedRes.access_token) {
        userToken = longLivedRes.access_token;
      }
    } catch (e) {
      console.warn("[Meta OAuth] Could not upgrade to long-lived token, using short-lived:", e.message);
    }

    // 5. Step 3: Fetch Managed Pages & Connected Instagram Accounts
    const pagesUrl = `https://graph.facebook.com/v24.0/me/accounts?fields=id,name,access_token,category,picture{url},instagram_business_account{id,username}&access_token=${userToken}`;
    const pagesRes = await httpsRequest(pagesUrl);
    const pagesList = pagesRes.data || [];

    if (pagesList.length === 0) {
      return res.redirect('/#connections?meta_auth=no_pages');
    }

    // 6. Step 4: Auto-subscribe each Page to webhooks & store page tokens securely
    const subscribedPages = [];
    for (const page of pagesList) {
      // Store token server-side only
      global.META_PAGE_TOKENS[page.id] = {
        pageId: page.id,
        pageName: page.name,
        accessToken: page.access_token,
        savedAt: new Date().toISOString()
      };

      // Auto-subscribe page to webhooks (leadgen, messages, messaging_postbacks)
      try {
        const subUrl = `https://graph.facebook.com/v24.0/${page.id}/subscribed_apps?subscribed_fields=leadgen,messages,messaging_postbacks&access_token=${page.access_token}`;
        await httpsRequest(subUrl, { method: 'POST' });
        console.log(`[Meta Webhooks] Successfully subscribed page: ${page.name} (${page.id})`);
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

    // If Supabase is configured, persist page metadata and encrypted tokens
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

module.exports = createVercelHandler(metaCallbackHandler);
