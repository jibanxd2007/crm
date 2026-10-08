const { createClient } = require('@supabase/supabase-js');

exports.handler = async function(event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const authHeader = event.headers.authorization;
    const userIdHeader = event.headers['x-user-id'];

    let totalSpend = 0;
    let totalLeads = 0;
    let totalWon = 0;
    let totalWonValue = 0;
    let pageBreakdown = [];
    let campaignBreakdown = [];

    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      
      // Fetch insights
      const { data: insights } = await supabase
        .from('ad_insights')
        .select('*');

      // Fetch leads for attribution calculation
      const { data: leads } = await supabase
        .from('leads')
        .select('id, page_id, campaign_id, status, lead_value');

      if (Array.isArray(insights)) {
        insights.forEach(ins => {
          totalSpend += parseFloat(ins.spend || 0);
        });
      }

      if (Array.isArray(leads)) {
        totalLeads = leads.length;
        const wonLeads = leads.filter(l => l.status === 'Won' || l.status === 'won' || l.status === 'Converted');
        totalWon = wonLeads.length;
        totalWonValue = wonLeads.reduce((sum, l) => sum + parseFloat(l.lead_value || 0), 0);
      }
    }

    const cpl = totalLeads > 0 ? (totalSpend / totalLeads) : 0;
    const cpa = totalWon > 0 ? (totalSpend / totalWon) : 0;
    const roas = totalSpend > 0 ? (totalWonValue / totalSpend) : 0;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'success',
        summary: {
          totalLeads,
          qualified: 0,
          won: totalWon,
          spend: totalSpend,
          cpl: Math.round(cpl * 100) / 100,
          cpa: Math.round(cpa * 100) / 100,
          roas: Math.round(roas * 100) / 100,
          conversionRate: totalLeads > 0 ? ((totalWon / totalLeads) * 100).toFixed(1) + '%' : '0.0%'
        },
        pageBreakdown,
        campaignBreakdown,
        timestamp: new Date().toISOString()
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
