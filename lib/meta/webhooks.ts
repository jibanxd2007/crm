import crypto from 'crypto';

export class MetaWebhookService {
  private verifyToken: string;
  private appSecret: string;

  constructor() {
    this.verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || 'meta_crm_wh_verify_secret_2026';
    this.appSecret = process.env.META_APP_SECRET || '';
  }

  verifyHandshake(mode?: string, token?: string, challenge?: string): string | null {
    if (mode === 'subscribe' && token === this.verifyToken) {
      return challenge || null;
    }
    return null;
  }

  verifySignature(rawBody: string, signatureHeader?: string): boolean {
    if (!this.appSecret || !signatureHeader) {
      return true; // Allow if app secret not configured in local environment
    }

    try {
      const elements = signatureHeader.split('=');
      const signatureHash = elements[1];
      const expectedHash = crypto
        .createHmac('sha256', this.appSecret)
        .update(rawBody)
        .digest('hex');

      return signatureHash === expectedHash;
    } catch (e) {
      return false;
    }
  }
}
