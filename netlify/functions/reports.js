exports.handler = async function(event, context) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      status: "success",
      summary: {
        totalLeads: 216,
        qualified: 78,
        won: 42,
        spend: 245000,
        avgCpl: 185,
        conversionRate: "19.4%"
      },
      pageBreakdown: [
        { pageId: "page_01", name: "Apex Living", leads: 47, won: 12, spend: 42000 },
        { pageId: "page_02", name: "Elite Motors", leads: 38, won: 9, spend: 38000 },
        { pageId: "page_03", name: "Prime Healthcare", leads: 52, won: 11, spend: 48000 },
        { pageId: "page_04", name: "Urban Roasters", leads: 29, won: 5, spend: 26000 },
        { pageId: "page_05", name: "NovaTech SaaS", leads: 34, won: 4, spend: 56000 },
        { pageId: "page_06", name: "Zenith Wealth", leads: 16, won: 1, spend: 35000 }
      ],
      timestamp: new Date().toISOString()
    })
  };
};
