/**
 * Meta OAuth Login URL Generator Endpoint
 * GET /api/auth/meta/url
 */

import { MetaClient } from '../../services/meta-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const clientId = process.env.META_APP_ID;
  if (!clientId) {
    return res.status(400).json({
      error: 'META_APP_ID is not configured in environment variables.',
      instructions: 'Please set META_APP_ID and META_APP_SECRET in .env or Vercel dashboard.'
    });
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = process.env.META_REDIRECT_URI || `${proto}://${host}/api/auth/meta/callback`;

  // Random CSRF state token
  const state = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

  const url = MetaClient.getOAuthDialogUrl({
    clientId,
    redirectUri,
    state
  });

  return res.status(200).json({
    url,
    clientId,
    redirectUri,
    state
  });
}
