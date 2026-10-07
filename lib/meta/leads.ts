import { MetaGraphClient } from './client';

export interface MetaLeadData {
  id: string;
  created_time: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  field_data: Array<{
    name: string;
    values: string[];
  }>;
}

export class MetaLeadsService {
  private client: MetaGraphClient;

  constructor(pageAccessToken: string) {
    this.client = new MetaGraphClient(pageAccessToken);
  }

  async getLeadDetails(leadgenId: string): Promise<MetaLeadData> {
    return this.client.get<MetaLeadData>(leadgenId, {
      fields: 'id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data'
    });
  }

  static parseLeadFields(lead: MetaLeadData): {
    fullName: string;
    email?: string;
    phone?: string;
    customFields: Record<string, string>;
  } {
    let fullName = 'Facebook Prospect';
    let email = '';
    let phone = '';
    const customFields: Record<string, string> = {};

    (lead.field_data || []).forEach(field => {
      const val = field.values && field.values[0] ? field.values[0] : '';
      const name = field.name.toLowerCase();

      if (name.includes('full_name') || name.includes('name')) {
        fullName = val || fullName;
      } else if (name.includes('email')) {
        email = val;
      } else if (name.includes('phone') || name.includes('phone_number')) {
        phone = val;
      } else {
        customFields[field.name] = val;
      }
    });

    return { fullName, email, phone, customFields };
  }
}
