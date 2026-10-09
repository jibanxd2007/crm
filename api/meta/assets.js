/**
 * Production Meta Assets Endpoint (Pages, Instagram, Ad Accounts)
 * GET /api/meta/assets
 * POST /api/meta/assets/toggle
 */

import { MetaClient } from '../services/meta-client.js';
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = getSupabaseAdmin();
  const defaultOrgId = '00000000-0000-0000-0000-000000000001';

  // 1. Authentication Check
  const authHeader = req.headers.authorization || '';
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
  }

  // --------------------------------------------------------------------------
  // GET: Fetch Connected Meta Assets
  // --------------------------------------------------------------------------
  if (req.method === 'GET') {
    try {
      if (supabase) {
        const [pagesRes, adAccRes, connRes] = await Promise.all([
          supabase.from('meta_pages').select('id, meta_page_id, name, username, category, avatar_url, tasks, is_connected, webhook_subscribed, ig_business_account_id, ig_username, followers_count, last_synced_at, instagram_accounts(*)').eq('organization_id', defaultOrgId),
          supabase.from('ad_accounts').select('id, meta_ad_account_id, name, currency, timezone_name, account_status, amount_spent, business_name, is_connected').eq('organization_id', defaultOrgId),
          supabase.from('meta_connections').select('id, organization_id, meta_user_id, meta_user_name, meta_user_email, token_expires_at, scopes, is_active, last_error, last_synced_at').eq('organization_id', defaultOrgId).maybeSingle()
        ]);

        return res.status(200).json({
          connection: connRes.data || null,
          pages: pagesRes.data || [],
          adAccounts: adAccRes.data || []
        });
      }

      // If Supabase is not configured, query directly via system/user token if provided
      const token = req.headers.authorization?.replace('Bearer ', '') || process.env.META_ACCESS_TOKEN;
      if (token) {
        const client = new MetaClient(token);
        const [me, pages, adAccounts] = await Promise.all([
          client.getMe().catch(() => null),
          client.getPages().catch(() => ({ data: [] })),
          client.getAdAccounts().catch(() => ({ data: [] }))
        ]);

        return res.status(200).json({
          connection: me ? { meta_user_id: me.id, meta_user_name: me.name, is_active: true } : null,
          pages: (pages.data || []).map(p => ({
            id: `page_${p.id}`,
            meta_page_id: p.id,
            name: p.name,
            category: p.category,
            avatar_url: p.picture?.data?.url,
            is_connected: true,
            ig_username: p.instagram_business_account?.username
          })),
          adAccounts: (adAccounts.data || []).map(a => ({
            id: a.id,
            meta_ad_account_id: a.account_id,
            name: a.name,
            currency: a.currency,
            is_connected: true
          }))
        });
      }

      return res.status(200).json({
        connection: null,
        pages: [],
        adAccounts: []
      });
    } catch (err) {
      console.error('[Meta Assets] Error retrieving assets:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // POST: Toggle Page or Ad Account Connection
  // --------------------------------------------------------------------------
  if (req.method === 'POST') {
    const { asset_type, asset_id, is_connected } = req.body || {};

    if (!asset_type || !asset_id) {
      return res.status(400).json({ error: 'asset_type and asset_id are required.' });
    }

    try {
      if (supabase) {
        if (asset_type === 'page') {
          await supabase.from('meta_pages')
            .update({ is_connected, updated_at: new Date().toISOString() })
            .eq('id', asset_id);
        } else if (asset_type === 'ad_account') {
          await supabase.from('ad_accounts')
            .update({ is_connected, updated_at: new Date().toISOString() })
            .eq('id', asset_id);
        }

        await supabase.from('audit_logs').insert({
          organization_id: defaultOrgId,
          action: is_connected ? 'ASSET_CONNECTED' : 'ASSET_DISCONNECTED',
          resource_type: asset_type,
          resource_id: asset_id
        });
      }

      return res.status(200).json({ success: true, asset_id, is_connected });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
