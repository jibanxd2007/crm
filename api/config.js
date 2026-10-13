/**
 * Public Client Configuration Endpoint
 * Safely provides public configuration (Supabase URL, Anon Key, App URL)
 * Never exposes service role keys or app secrets.
 */

const { createVercelHandler } = require('./_utils/index.js');

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

  const resendFromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const isSenderVerified = Boolean(
    process.env.RESEND_FROM_EMAIL &&
    process.env.RESEND_FROM_EMAIL.trim() !== '' &&
    process.env.RESEND_FROM_EMAIL.trim().toLowerCase() !== 'onboarding@resend.dev'
  );

  let fxRates = {
    base: 'INR',
    INR: 1.0,
    USD: 0.012,
    NZD: 0.020,
    EUR: 0.011,
    GBP: 0.0095,
    updated: '2026-10-14'
  };

  if (process.env.FX_RATES_JSON) {
    try {
      const parsed = JSON.parse(process.env.FX_RATES_JSON);
      fxRates = { ...fxRates, ...parsed };
    } catch (e) {
      console.warn('[Config Warning]: Failed to parse FX_RATES_JSON:', e.message);
    }
  }

  return res.status(200).json({
    status: 'ok',
    supabaseUrl,
    supabaseAnonKey,
    appUrl,
    productionUrl: 'https://crm-beta-three-36.vercel.app',
    apiVersion: process.env.META_API_VERSION || 'v24.0',
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
    resendFromEmail,
    resendSenderVerified: isSenderVerified,
    fxRates,
    timestamp: new Date().toISOString()
  });
}

module.exports = createVercelHandler(configHandler);
