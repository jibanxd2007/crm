exports.handler = async function(event, context) {
  const pages = [
    { id: "page_01", name: "Apex Living", category: "Real Estate & Architecture", color: "#6366F1", leadsCount: 47, messagesCount: 12, ad_account_id: "act_apex_living", ig_username: "@apex_living_official", is_connected: true },
    { id: "page_02", name: "Elite Motors", category: "Automotive Dealership", color: "#3B82F6", leadsCount: 38, messagesCount: 8, ad_account_id: "act_elite_motors", ig_username: "@elitemotors_luxury", is_connected: true },
    { id: "page_03", name: "Prime Healthcare", category: "Medical & Wellness Clinic", color: "#10B981", leadsCount: 52, messagesCount: 15, ad_account_id: "act_prime_health", ig_username: "@primehealth_care", is_connected: true },
    { id: "page_04", name: "Urban Roasters", category: "Food & Beverage", color: "#F59E0B", leadsCount: 29, messagesCount: 6, ad_account_id: "act_urban_roasters", ig_username: "@urbanroasters_coffee", is_connected: true },
    { id: "page_05", name: "NovaTech SaaS", category: "B2B Software Solutions", color: "#8B5CF6", leadsCount: 34, messagesCount: 9, ad_account_id: "act_novatech_saas", ig_username: "@novatech_cloud", is_connected: true },
    { id: "page_06", name: "Zenith Wealth", category: "Financial Advisory & Wealth", color: "#EC4899", leadsCount: 16, messagesCount: 4, ad_account_id: "act_zenith_wealth", ig_username: "@zenith_wealth_mgmt", is_connected: true }
  ];

  // RBAC check if user ID is provided in query params or headers
  const userId = (event.queryStringParameters && event.queryStringParameters.userId) || (event.headers['x-user-id']);
  const role = (event.queryStringParameters && event.queryStringParameters.role) || (event.headers['x-user-role']);

  let accessiblePages = pages;
  if (role === 'staff' && userId) {
    // Map staff to their assigned pages
    const staffAssignments = {
      'user_02': ['page_01', 'page_03'], // Rahul
      'user_03': ['page_02'],             // Amit
      'user_04': ['page_04', 'page_05'], // Priya
      'user_05': ['page_06'],             // Vikram
      'user_06': ['page_01', 'page_02'], // Sneha
      'user_07': ['page_03', 'page_05']  // Rohan
    };
    const allowed = staffAssignments[userId] || [];
    accessiblePages = pages.filter(p => allowed.includes(p.id));
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      status: "success",
      count: accessiblePages.length,
      pages: accessiblePages,
      timestamp: new Date().toISOString()
    })
  };
};
