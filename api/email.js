/**
 * Unified Email Serverless Function Handler
 * Routes requests to OAuth or Email Messaging handlers.
 */
const { createVercelHandler } = require('./_utils/index.js');

async function emailUnifiedHandler(req, res) {
  const url = req.url || '';
  const path = (req.query && req.query.path) || '';
  if (url.includes('/oauth') || path === 'oauth' || req.query?.provider) {
    const oauthHandler = require('./_email/oauth.js');
    return oauthHandler(req, res);
  }
  if (path === 'test-resend' || url.includes('/test-resend')) {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return res.status(400).json({
        error: "RESEND_API_KEY is not configured in Vercel Environment Variables. Please add RESEND_API_KEY in Vercel Project Settings."
      });
    }
    const { httpsRequest } = require('./_utils/index.js');
    const targetEmail = req.query?.to || req.body?.to;
    if (!targetEmail) {
      return res.status(400).json({
        error: "Missing required 'to' email address in request query or body."
      });
    }
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const isSenderUnverified = !process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL.trim() === '' || process.env.RESEND_FROM_EMAIL.trim().toLowerCase() === 'onboarding@resend.dev';
    try {
      const resp = await httpsRequest('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: {
          from: fromEmail,
          to: [targetEmail],
          subject: 'Hello World — MetaCRM Resend Integration',
          html: '<p>Congrats on sending your <strong>first email via Resend in MetaCRM</strong>!</p>'
        }
      });
      return res.status(200).json({
        status: "success",
        message: `Test email successfully dispatched to ${targetEmail}`,
        id: resp?.id || resp,
        warning: isSenderUnverified ? "SENDER_NOT_VERIFIED" : undefined,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      return res.status(400).json({
        status: "error",
        error: e.message,
        warning: isSenderUnverified ? "SENDER_NOT_VERIFIED" : undefined
      });
    }
  }

  const messagesHandler = require('./_email/messages.js');
  return messagesHandler(req, res);
}

module.exports = createVercelHandler(emailUnifiedHandler);
