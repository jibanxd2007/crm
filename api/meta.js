/**
 * Unified Meta Serverless Function Handler
 * Consolidated endpoint for Meta Graph API integration:
 * - Webhooks: /api/webhooks/meta (or path=webhook)
 * - Sync & Crons: /api/meta/sync, /api/meta/ad-spend-sync (or path=sync)
 * - OAuth: /api/auth/meta/*, /api/meta/callback (or path=oauth)
 * - Campaigns, Insights, Assets, ROI: /api/campaigns, /api/meta/*
 */
const { createVercelHandler } = require('./_utils/index.js');

async function metaUnifiedHandler(req, res) {
  const url = req.url || '';
  const path = (req.query && req.query.path) || '';

  if (url.includes('/webhook') || path === 'webhook') {
    const webhookHandler = require('./_meta/webhook.js');
    return webhookHandler(req, res);
  }
  if (url.includes('/sync') || url.includes('ad-spend') || path === 'sync') {
    const syncHandler = require('./_meta/sync.js');
    return syncHandler(req, res);
  }
  if (url.includes('/auth') || url.includes('/oauth') || url.includes('/callback') || path === 'oauth') {
    const oauthHandler = require('./_meta/oauth.js');
    return oauthHandler(req, res);
  }
  if (url.includes('/simulate-error') || path === 'simulate-error') {
    const queryType = (req.query && req.query.type) || (new URL(req.url, 'http://localhost').searchParams.get('type'));
    if (queryType === 'expired_token') {
      return res.status(401).json({
        error: {
          message: "Error validating access token: Session has expired or revoked.",
          type: "OAuthException",
          code: 190,
          error_subcode: 463
        }
      });
    }
    if (queryType === 'rate_limit') {
      return res.status(429).json({
        error: {
          message: "(#4) Application request limit reached",
          type: "OAuthException",
          code: 4
        }
      });
    }
    if (queryType === 'permissions') {
      return res.status(403).json({
        error: {
          message: "(#200) Requires pages_manage_ads permission to manage this ad account",
          type: "OAuthException",
          code: 200
        }
      });
    }
    return res.status(400).json({ error: "Unknown error type requested" });
  }

  const campaignsHandler = require('./_meta/campaigns.js');
  return campaignsHandler(req, res);
}

module.exports = createVercelHandler(metaUnifiedHandler);
