/**
 * Unified Email Serverless Function Handler
 * Routes requests to OAuth or Email Messaging handlers.
 */
const { createVercelHandler } = require('./_utils.js');

async function emailUnifiedHandler(req, res) {
  const url = req.url || '';
  const path = (req.query && req.query.path) || '';
  if (url.includes('/oauth') || path === 'oauth' || req.query?.provider) {
    const oauthHandler = require('./_email/oauth.js');
    return oauthHandler(req, res);
  }
  const messagesHandler = require('./_email/messages.js');
  return messagesHandler(req, res);
}

module.exports = createVercelHandler(emailUnifiedHandler);
