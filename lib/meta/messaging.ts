import { MetaGraphClient } from './client';

export interface SendMessageResponse {
  recipient_id: string;
  message_id: string;
}

export class MetaMessagingService {
  private client: MetaGraphClient;

  constructor(pageAccessToken: string) {
    this.client = new MetaGraphClient(pageAccessToken);
  }

  async sendTextMessage(recipientPsid: string, text: string): Promise<SendMessageResponse> {
    return this.client.post<SendMessageResponse>('me/messages', {
      recipient: { id: recipientPsid },
      message: { text }
    });
  }

  async sendAttachmentMessage(recipientPsid: string, attachmentUrl: string, type: 'image' | 'file' = 'image'): Promise<SendMessageResponse> {
    return this.client.post<SendMessageResponse>('me/messages', {
      recipient: { id: recipientPsid },
      message: {
        attachment: {
          type,
          payload: {
            url: attachmentUrl,
            is_reusable: true
          }
        }
      }
    });
  }
}
