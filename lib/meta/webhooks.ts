import crypto from 'crypto';

export class MetaWebhookService {
  private verifyToken: string;
  private appSecret: string;

  constructor() {
    this.verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || '';
    this.appSecret = process.env.META_APP_SECRET || '';
  }

  verifyHandshake(mode?: string, token?: string, challenge?: string): string | null {
    if (mode === 'subscribe' && this.verifyToken && token === this.verifyToken) {
      return challenge || null;
    }
    return null;
  }

  verifySignature(rawBody: string, signatureHeader?: string): boolean {
    if (!this.appSecret || !signatureHeader) {
      return false;
    }

    try {
      const elements = signatureHeader.split('=');
      if (elements.length !== 2 || elements[0] !== 'sha256') {
        return false;
      }
      const signatureHash = elements[1];
      const expectedHash = crypto
        .createHmac('sha256', this.appSecret)
        .update(rawBody)
        .digest('hex');

      const sigBuf = Buffer.from(signatureHash, 'hex');
      const expBuf = Buffer.from(expectedHash, 'hex');
      if (sigBuf.length !== expBuf.length) {
        return false;
      }
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch (e) {
      return false;
    }
  }
}
