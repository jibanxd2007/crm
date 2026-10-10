const { createVercelHandler } = require('../_utils.js');

async function zernioSimulateHandler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const randomId = Math.floor(100000 + Math.random() * 900000);
  const body = req.body || {};

  const simulatedLead = {
    id: `lead_meta_${randomId}`,
    meta_lead_id: `meta_lead_${randomId}`,
    name: body.name || `Meta Test Lead ${randomId}`,
    phone: body.phone || `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`,
    email: body.email || `test.lead.${randomId}@example.com`,
    page_id: body.pageId || body.page_id || "page_live",
    pageId: body.pageId || body.page_id || "page_live",
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
    assigned_staff_id: body.assignedTo || null,
    assignedStaffId: body.assignedTo || null,
    lead_value: body.value || 0,
    value: body.value || 0,
    isHotLead: (body.value || 0) >= 50000,
    slaTargetMinutes: 5,
    attribution: {
      platform: "Facebook Lead Ads",
      page: "Connected Facebook Page",
      campaign: "Live Lead Generation Campaign",
      ad: "Lead Ad Creative",
      formId: `form_fb_${randomId}`,
      timestamp: new Date().toISOString()
    }
  };

  return res.status(200).json({
    status: "success",
    message: "Simulated inbound Facebook Lead Ad processed and attributed",
    lead: simulatedLead,
    timestamp: new Date().toISOString()
  });
}

module.exports = createVercelHandler(zernioSimulateHandler);
