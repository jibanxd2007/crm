const { createClient } = require('@supabase/supabase-js');
const { resolveUser, createVercelHandler } = require('./_utils.js');

async function reportsHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, X-User-Id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Mandatory Authentication Check
  const user = resolveUser(req.headers);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Authentication credentials required" });
  }

  const requestedPage = req.query?.page_id || req.query?.pageId;

  // 2. Authorization Check for Page Scoping
  if (requestedPage && user.role !== 'admin' && !user.pages.includes('*')) {
    if (!user.pages.includes(requestedPage)) {
      return res.status(403).json({
        error: "Forbidden: Access denied to reports for unassigned page",
        requestedPage: requestedPage,
        userRole: user.role
      });
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

    return res.status(200).json({
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
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = createVercelHandler(reportsHandler);
