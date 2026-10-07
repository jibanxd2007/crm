exports.handler = async function(event, context) {
  const campaigns = [
    { id: "cmp_01", name: "Diwali Luxury Villas 2026", page_id: "page_01", status: "ACTIVE", spend: 42000, leads: 47, cpl: 185, impressions: 145000, clicks: 3800 },
    { id: "cmp_02", name: "Festive Drive Offers", page_id: "page_02", status: "ACTIVE", spend: 38000, leads: 38, cpl: 195, impressions: 120000, clicks: 3100 },
    { id: "cmp_03", name: "Annual Health Checkup", page_id: "page_03", status: "ACTIVE", spend: 48000, leads: 52, cpl: 165, impressions: 180000, clicks: 4200 },
    { id: "cmp_04", name: "Specialty Cold Brew Launch", page_id: "page_04", status: "ACTIVE", spend: 26000, leads: 29, cpl: 210, impressions: 95000, clicks: 2400 },
    { id: "cmp_05", name: "Enterprise Cloud Demo", page_id: "page_05", status: "ACTIVE", spend: 56000, leads: 34, cpl: 245, impressions: 110000, clicks: 2900 },
    { id: "cmp_06", name: "Portfolio Advisory Q4", page_id: "page_06", status: "ACTIVE", spend: 35000, leads: 16, cpl: 280, impressions: 75000, clicks: 1800 }
  ];

  const pageId = event.queryStringParameters && event.queryStringParameters.pageId;
  const filtered = pageId && pageId !== 'all' ? campaigns.filter(c => c.page_id === pageId) : campaigns;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      status: "success",
      count: filtered.length,
      campaigns: filtered,
      timestamp: new Date().toISOString()
    })
  };
};
