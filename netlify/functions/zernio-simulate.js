exports.handler = async function(event, context) {
  const randomId = Math.floor(100000 + Math.random() * 900000);

  const simulatedLead = {
    id: `lead_meta_${randomId}`,
    meta_lead_id: `meta_lead_${randomId}`,
    name: `Meta Test Lead ${randomId}`,
    phone: `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`,
    email: `test.lead.${randomId}@example.com`,
    page_id: "page_live",
    pageId: "page_live",
    source: "Facebook Lead Ads",
    status: "New Lead",
    campaign_id: "cmp_live_01",
    campaignId: "cmp_live_01",
    ad_id: "ad_live_01",
    adId: "ad_live_01",
    form_id: `form_fb_${randomId}`,
    formId: `form_fb_${randomId}`,
    created_at: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    assigned_staff_id: null,
    assignedStaffId: null,
    attribution: {
      platform: "Facebook Lead Ads",
      page: "Connected Facebook Page",
      campaign: "Live Lead Generation Campaign",
      ad: "Lead Ad Creative",
      formId: `form_fb_${randomId}`,
      timestamp: new Date().toISOString()
    }
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      status: "success",
      message: "Simulated inbound Facebook Lead Ad processed and attributed",
      lead: simulatedLead,
      timestamp: new Date().toISOString()
    })
  };
};
