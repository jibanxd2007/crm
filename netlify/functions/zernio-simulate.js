exports.handler = async function(event, context) {
  const pages = [
    { id: "page_01", name: "Apex Living", campaign: "Diwali Luxury Villas 2026", ad: "Video 02 - Tour" },
    { id: "page_02", name: "Elite Motors", campaign: "Festive Drive Offers", ad: "Carousel Ad 01" },
    { id: "page_03", name: "Prime Healthcare", campaign: "Annual Health Checkup", ad: "Banner 04" },
    { id: "page_04", name: "Urban Roasters", campaign: "Specialty Cold Brew Launch", ad: "Story 03" },
    { id: "page_05", name: "NovaTech SaaS", campaign: "Enterprise Cloud Demo", ad: "Lead Magnet 01" },
    { id: "page_06", name: "Zenith Wealth", campaign: "Portfolio Advisory Q4", ad: "Static Ad 05" }
  ];

  const randPage = pages[Math.floor(Math.random() * pages.length)];
  const randomId = Math.floor(100000 + Math.random() * 900000);
  const sampleNames = ["Sunil Mehta", "Deepak Chopra", "Kavita Iyer", "Rohan Joshi", "Suresh Menon", "Pooja Reddy"];
  const chosenName = sampleNames[Math.floor(Math.random() * sampleNames.length)];

  const simulatedLead = {
    id: `lead_zn_${randomId}`,
    meta_lead_id: `meta_lead_${randomId}`,
    name: `${chosenName} (Live Test)`,
    phone: `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`,
    email: `lead.${randomId}@example.com`,
    page_id: randPage.id,
    pageId: randPage.id,
    source: `Facebook Lead Form (${randPage.name})`,
    status: "New Lead",
    campaign_id: randPage.campaign,
    campaignId: randPage.campaign,
    ad_id: randPage.ad,
    adId: randPage.ad,
    form_id: `form_fb_${randPage.id}_01`,
    formId: `form_fb_${randPage.id}_01`,
    created_at: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    assigned_staff_id: "user_02",
    assignedStaffId: "user_02",
    attribution: {
      platform: "Facebook Lead Ads",
      page: randPage.name,
      campaign: randPage.campaign,
      ad: randPage.ad,
      formId: `form_fb_${randPage.id}_01`,
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
