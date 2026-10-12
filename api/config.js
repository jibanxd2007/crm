/**
 * Public Client Configuration Endpoint
 * Safely provides public configuration (Supabase URL, Anon Key, App URL)
 * Never exposes service role keys or app secrets.
 */

const { createVercelHandler } = require('./_utils.js');

async function configHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://crm-beta-three-36.vercel.app';

  return res.status(200).json({
    status: 'ok',
    supabaseUrl,
    supabaseAnonKey,
    appUrl,
    productionUrl: 'https://crm-beta-three-36.vercel.app',
    apiVersion: process.env.META_API_VERSION || 'v24.0',
    timestamp: new Date().toISOString()
  });
}

module.exports = createVercelHandler(configHandler);
