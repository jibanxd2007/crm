const { createClient } = require('@supabase/supabase-js');

const USER_PERMISSIONS = {
  'admin': { role: 'admin', pages: ['*'] },
  'user_a': { role: 'staff', pages: ['page_01', 'page_a'] },
  'user_b': { role: 'staff', pages: ['page_02', 'page_b'] },
  'rahul': { role: 'staff', pages: ['page_01', 'page_02'] },
  'amit': { role: 'staff', pages: ['page_03', 'page_04'] },
  'priya': { role: 'staff', pages: ['page_05', 'page_06'] }
};

function resolveUser(headers) {
  const authHeader = headers['authorization'] || headers['Authorization'] || '';
  const userId = headers['x-user-id'] || headers['X-User-Id'] || (authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '').trim() : '');
  if (!userId) return null;
  const normalized = userId.toLowerCase();
  return USER_PERMISSIONS[normalized] || { role: 'staff', pages: [normalized] };
}

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

  // 1. Mandatory Authentication Check
  const user = resolveUser(event.headers);
  if (!user) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Unauthorized: Authentication credentials required" })
    };
  }

  const params = event.queryStringParameters || {};
  const requestedPage = params.page_id || params.pageId;

  // 2. Authorization Check for Page Scoping
  if (requestedPage && user.role !== 'admin' && !user.pages.includes('*')) {
    if (!user.pages.includes(requestedPage)) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          error: "Forbidden: Access denied to reports for unassigned page",
          requestedPage: requestedPage,
          userRole: user.role
        })
      };
    }
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let totalSpend = 0;
    let totalLeads = 0;
    let totalWon = 0;
    let totalWonValue = 0;
    let pageBreakdown = [];
    let campaignBreakdown = [];

    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      
      // Fetch insights scoped by user permissions
      let insightsQuery = supabase.from('ad_insights').select('*');
      if (user.role !== 'admin' && !user.pages.includes('*')) {
        insightsQuery = insightsQuery.in('page_id', user.pages);
      } else if (requestedPage) {
        insightsQuery = insightsQuery.eq('page_id', requestedPage);
      }
      const { data: insights } = await insightsQuery;

      // Fetch leads scoped by user permissions
      let leadsQuery = supabase.from('leads').select('id, page_id, campaign_id, status, lead_value, assigned_to');
      if (user.role !== 'admin' && !user.pages.includes('*')) {
        leadsQuery = leadsQuery.in('page_id', user.pages);
      } else if (requestedPage) {
        leadsQuery = leadsQuery.eq('page_id', requestedPage);
      }
      const { data: leads } = await leadsQuery;

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
        userRole: user.role,
        accessiblePages: user.pages,
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
