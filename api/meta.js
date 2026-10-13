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
  if (url.includes('/auth') || url.includes('/callback') || path === 'oauth') {
    const oauthHandler = require('./_meta/oauth.js');
    return oauthHandler(req, res);
  }
  const campaignsHandler = require('./_meta/campaigns.js');
  return campaignsHandler(req, res);
}

module.exports = createVercelHandler(metaUnifiedHandler);
