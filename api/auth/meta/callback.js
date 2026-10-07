/**
 * Production Meta OAuth Callback Endpoint
 * GET /api/auth/meta/callback?code=...&state=...
 */

import { createClient } from '@supabase/supabase-js';
import { MetaClient } from '../../services/meta-client.js';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false }
  });
}

export default async function handler(req, res) {
  const { code, error, error_description } = req.query;

  if (error) {
    console.error('[Meta OAuth] Authorization rejected:', error, error_description);
    return res.redirect(`/index.html?meta_auth=error&msg=${encodeURIComponent(error_description || error)}`);
  }

  if (!code) {
    return res.status(400).send('Missing authorization code from Meta.');
  }

  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).send('META_APP_ID or META_APP_SECRET is not configured on the server.');
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = process.env.META_REDIRECT_URI || `${proto}://${host}/api/auth/meta/callback`;

  try {
    // 1. Exchange authorization code for short-lived token
    const tokenData = await MetaClient.exchangeCodeForToken({
      clientId,
      clientSecret,
      redirectUri,
      code
    });

    // 2. Exchange for long-lived 60-day token
    const longLived = await MetaClient.exchangeForLongLivedToken({
      clientId,
      clientSecret,
      shortLivedToken: tokenData.access_token
    });

    const userToken = longLived.access_token;
    const client = new MetaClient(userToken);

    // 3. Fetch real user profile
    const me = await client.getMe();

    // 4. Fetch real Pages & Instagram accounts
    const pagesData = await client.getPages();
    const realPages = pagesData.data || [];

    // 5. Fetch real Ad Accounts
    const adAccData = await client.getAdAccounts();
    const realAdAccounts = adAccData.data || [];

    // 6. Save to Supabase database if available
    const supabase = getSupabaseAdmin();
    const defaultOrgId = '00000000-0000-0000-0000-000000000001';

    if (supabase) {
      // Upsert Meta Connection
      const tokenExpiresAt = new Date(Date.now() + (longLived.expires_in || 5184000) * 1000).toISOString();
      const { data: conn } = await supabase.from('meta_connections').upsert({
        organization_id: defaultOrgId,
        meta_user_id: me.id,
        meta_user_name: me.name,
        meta_user_email: me.email || null,
        access_token: userToken,
        token_expires_at: tokenExpiresAt,
        scopes: ['pages_show_list', 'leads_retrieval', 'pages_manage_ads', 'ads_read'],
        is_active: true,
        last_synced_at: new Date().toISOString()
      }, { onConflict: 'organization_id, meta_user_id' }).select().single();

      // Upsert real Pages & auto-subscribe to Lead Webhook
      for (const p of realPages) {
        let igId = null;
        let igUsername = null;
        if (p.instagram_business_account) {
          igId = p.instagram_business_account.id;
          igUsername = p.instagram_business_account.username;

          // Upsert Instagram Account
          await supabase.from('instagram_accounts').upsert({
            id: `ig_${igId}`,
            organization_id: defaultOrgId,
            page_id: `page_${p.id}`,
            ig_id: igId,
            username: igUsername,
            name: p.instagram_business_account.name || null,
            profile_picture_url: p.instagram_business_account.profile_picture_url || null
          });
        }

        let webhookSubscribed = false;
        try {
          if (p.access_token) {
            await client.subscribePageToLeadWebhook(p.id, p.access_token);
            webhookSubscribed = true;
          }
        } catch (subErr) {
          console.warn(`[Meta Webhook] Could not auto-subscribe page ${p.name} (${p.id}):`, subErr.message);
        }

        await supabase.from('meta_pages').upsert({
          id: `page_${p.id}`,
          organization_id: defaultOrgId,
          connection_id: conn ? conn.id : null,
          meta_page_id: p.id,
          name: p.name,
          category: p.category || 'Business',
          avatar_url: p.picture && p.picture.data ? p.picture.data.url : null,
          page_access_token: p.access_token || null,
          tasks: p.tasks || [],
          is_connected: true,
          webhook_subscribed: webhookSubscribed,
          ig_business_account_id: igId,
          ig_username: igUsername,
          last_synced_at: new Date().toISOString()
        }, { onConflict: 'organization_id, meta_page_id' });
      }

      // Upsert real Ad Accounts
      for (const a of realAdAccounts) {
        await supabase.from('ad_accounts').upsert({
          id: a.id,
          organization_id: defaultOrgId,
          connection_id: conn ? conn.id : null,
          meta_ad_account_id: a.account_id || a.id.replace('act_', ''),
          name: a.name || `Ad Account ${a.account_id}`,
          currency: a.currency || 'USD',
          timezone_name: a.timezone_name || 'UTC',
          account_status: a.account_status || 1,
          amount_spent: a.amount_spent ? parseFloat(a.amount_spent) / 100 : 0.00,
          business_name: a.business ? a.business.name : null,
          is_connected: true
        }, { onConflict: 'organization_id, meta_ad_account_id' });
      }

      // Record Audit Log
      await supabase.from('audit_logs').insert({
        organization_id: defaultOrgId,
        action: 'CONNECTED_META_ACCOUNT',
        resource_type: 'meta_connection',
        resource_id: me.id,
        metadata: {
          user_name: me.name,
          pages_count: realPages.length,
          ad_accounts_count: realAdAccounts.length
        }
      });
    }

    // Redirect user back to application with state
    const params = new URLSearchParams({
      meta_auth: 'success',
      user_id: me.id,
      user_name: me.name,
      user_avatar: (me.picture && me.picture.data && me.picture.data.url) || '',
      pages_count: realPages.length.toString(),
      accounts_count: realAdAccounts.length.toString()
    });

    return res.redirect(`/index.html?${params.toString()}`);
  } catch (err) {
    console.error('[Meta OAuth] Callback error:', err);
    return res.redirect(`/index.html?meta_auth=error&msg=${encodeURIComponent(err.message)}`);
  }
}
