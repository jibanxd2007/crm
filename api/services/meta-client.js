/**
 * Centralized Meta Graph API v20.0 Client
 * 
 * Handles:
 * - Centralized API calls with configurable version (META_API_VERSION or v20.0)
 * - Rate limit inspection (x-business-use-case-usage / x-app-usage)
 * - Exponential backoff retry logic
 * - Error standardization & Meta permissions inspection
 */

const META_API_VERSION = process.env.META_API_VERSION || 'v20.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export class MetaClient {
  constructor(accessToken = null) {
    this.accessToken = accessToken || process.env.META_SYSTEM_USER_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  }

  /**
   * Execute an authenticated request against Meta Graph API
   */
  async request(endpoint, options = {}, retries = 2) {
    const url = endpoint.startsWith('http') ? endpoint : `${GRAPH_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    
    // Attach access token
    const token = options.token || this.accessToken;
    const separator = url.includes('?') ? '&' : '?';
    const finalUrl = token ? `${url}${separator}access_token=${encodeURIComponent(token)}` : url;

    const fetchOptions = {
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      ...(options.body ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) } : {})
    };

    try {
      const response = await fetch(finalUrl, fetchOptions);
      
      // Inspect Meta Rate Limit Headers
      const appUsage = response.headers.get('x-app-usage');
      const bncUsage = response.headers.get('x-business-use-case-usage');
      if (appUsage || bncUsage) {
        // Log or track rate limit pressure
        // e.g. {"call_count": 15, "total_cputime": 10, "total_time": 12}
      }

      const data = await response.json();

      if (!response.ok || data.error) {
        const error = data.error || {};
        const isRateLimited = error.code === 4 || error.code === 17 || error.code === 32;
        
        // Auto-retry on rate limits with backoff
        if (isRateLimited && retries > 0) {
          const delay = (3 - retries) * 1500;
          await new Promise(r => setTimeout(r, delay));
          return this.request(endpoint, options, retries - 1);
        }

        const formattedError = new Error(error.message || `Meta API Error (${response.status})`);
        formattedError.code = error.code;
        formattedError.type = error.type;
        formattedError.subcode = error.error_subcode;
        formattedError.userTitle = error.error_user_title;
        formattedError.userMsg = error.error_user_msg;
        formattedError.fbtraceId = error.fbtrace_id;
        throw formattedError;
      }

      return data;
    } catch (err) {
      if (retries > 0 && err.message.includes('ECONNRESET')) {
        await new Promise(r => setTimeout(r, 1000));
        return this.request(endpoint, options, retries - 1);
      }
      throw err;
    }
  }

  // --- OAuth Operations ---
  static getOAuthDialogUrl({ clientId, redirectUri, state, scopes }) {
    const scopeStr = (scopes || [
      'public_profile',
      'email',
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_ads',
      'pages_manage_metadata',
      'leads_retrieval',
      'ads_read',
      'ads_management',
      'business_management'
    ]).join(',');

    return `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopeStr)}&state=${encodeURIComponent(state)}&response_type=code`;
  }

  static async exchangeCodeForToken({ clientId, clientSecret, redirectUri, code }) {
    const url = `${GRAPH_BASE_URL}/oauth/access_token?client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error((data.error && data.error.message) || 'Failed to exchange Meta OAuth code');
    }
    return data; // { access_token, token_type, expires_in }
  }

  static async exchangeForLongLivedToken({ clientId, clientSecret, shortLivedToken }) {
    const url = `${GRAPH_BASE_URL}/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${shortLivedToken}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error((data.error && data.error.message) || 'Failed to obtain long-lived Meta access token');
    }
    return data; // { access_token, token_type, expires_in }
  }

  // --- Core Assets Queries ---
  async getMe() {
    return this.request('/me?fields=id,name,email,picture.width(200).height(200)');
  }

  async getPages() {
    return this.request('/me/accounts?fields=id,name,category,tasks,access_token,picture.width(120).height(120),instagram_business_account{id,username,name,profile_picture_url}&limit=100');
  }

  async getAdAccounts() {
    return this.request('/me/adaccounts?fields=id,account_id,name,currency,timezone_name,account_status,amount_spent,business{id,name}&limit=100');
  }

  async subscribePageToLeadWebhook(pageId, pageAccessToken) {
    return this.request(`/${pageId}/subscribed_apps`, {
      method: 'POST',
      token: pageAccessToken,
      body: { subscribed_fields: ['leadgen'] }
    });
  }

  async getLead(leadgenId, pageAccessToken) {
    return this.request(`/${leadgenId}?fields=id,created_time,ad_id,form_id,field_data`, {
      token: pageAccessToken
    });
  }

  async getCampaigns(adAccountId, datePreset = 'last_30d') {
    const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    return this.request(`/${actId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,insights.date_preset(${datePreset}){spend,impressions,reach,clicks,ctr,cpc,cpm,actions,cost_per_action_type}&limit=100`);
  }

  async updateCampaignStatus(campaignId, status) {
    return this.request(`/${campaignId}`, {
      method: 'POST',
      body: { status }
    });
  }

  async updateCampaignBudget(campaignId, dailyBudgetCents) {
    return this.request(`/${campaignId}`, {
      method: 'POST',
      body: { daily_budget: dailyBudgetCents }
    });
  }
}
