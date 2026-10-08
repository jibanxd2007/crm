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
        totalLeads: 0,
        qualified: 0,
        won: 0,
        spend: 0,
        avgCpl: 0,
        conversionRate: "0.0%"
      },
      pageBreakdown: [],
      timestamp: new Date().toISOString()
    })
  };
};
