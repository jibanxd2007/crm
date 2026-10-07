import { META_GRAPH_API_VERSION, getMetaScopeString } from './permissions';

export interface TokenExchangeResult {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export class MetaOAuthService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.META_APP_ID || '';
    this.clientSecret = process.env.META_APP_SECRET || '';
    this.redirectUri = process.env.META_REDIRECT_URI || '';
  }

  getAuthorizationUrl(state: string, customRedirect?: string): string {
    const redirect = customRedirect || this.redirectUri;
    const scopes = getMetaScopeString();
    return `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(redirect)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scopes)}&response_type=code`;
  }

  async exchangeCodeForToken(code: string, customRedirect?: string): Promise<TokenExchangeResult> {
    const redirect = customRedirect || this.redirectUri;
    const url = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/oauth/access_token?client_id=${this.clientId}&client_secret=${this.clientSecret}&redirect_uri=${encodeURIComponent(redirect)}&code=${encodeURIComponent(code)}`;

    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to exchange authorization code for access token');
    }

    return res.json() as Promise<TokenExchangeResult>;
  }

  async exchangeForLongLivedToken(shortLivedToken: string): Promise<TokenExchangeResult> {
    const url = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${this.clientId}&client_secret=${this.clientSecret}&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`;

    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to exchange for long-lived token');
    }

    return res.json() as Promise<TokenExchangeResult>;
  }

  async getLongLivedUserToken(shortLivedToken: string): Promise<TokenExchangeResult> {
    return this.exchangeForLongLivedToken(shortLivedToken);
  }
}

