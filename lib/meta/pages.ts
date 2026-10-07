import { MetaGraphClient } from './client';

export interface MetaPageItem {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  picture?: {
    data?: {
      url?: string;
    };
  };
  instagram_business_account?: {
    id: string;
    username: string;
  };
}

export class MetaPagesService {
  private client: MetaGraphClient;

  constructor(userAccessToken: string) {
    this.client = new MetaGraphClient(userAccessToken);
  }

  async getManagedPages(): Promise<MetaPageItem[]> {
    const res = await this.client.get<{ data: MetaPageItem[] }>('me/accounts', {
      fields: 'id,name,access_token,category,picture{url},instagram_business_account{id,username}'
    });
    return res.data || [];
  }

  async subscribePageToWebhooks(pageId: string, pageAccessToken: string): Promise<boolean> {
    const pageClient = new MetaGraphClient(pageAccessToken);
    try {
      const res = await pageClient.post<{ success: boolean }>(`${pageId}/subscribed_apps`, {
        subscribed_fields: ['leadgen', 'messages', 'messaging_postbacks']
      });
      return !!res.success;
    } catch (e) {
      console.warn(`[Meta Webhook] Failed to subscribe page ${pageId}:`, e);
      return false;
    }
  }
}
