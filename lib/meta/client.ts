import { META_GRAPH_API_VERSION } from './permissions';

export class MetaGraphClient {
  private accessToken: string;
  private baseUrl: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
    this.baseUrl = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
  }

  async get<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint.replace(/^\//, '')}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const message = errBody.error?.message || `Meta API error: ${res.status} ${res.statusText}`;
      throw new Error(message);
    }

    return res.json() as Promise<T>;
  }

  async post<T>(endpoint: string, body: Record<string, any> = {}): Promise<T> {
    const url = `${this.baseUrl}/${endpoint.replace(/^\//, '')}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const message = errBody.error?.message || `Meta API error: ${res.status} ${res.statusText}`;
      throw new Error(message);
    }

    return res.json() as Promise<T>;
  }
}
