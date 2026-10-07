exports.handler = async function(event, context) {
  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: ''
    };
  }

  if (event.httpMethod === 'POST') {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch(e) {}
    
    // Check if it's an assignment or lead creation
    if (body.action === 'assign' || event.path.includes('/assign')) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          status: "success",
          message: `Lead ${body.leadId} assigned to staff ${body.staffId}`,
          assignedAt: new Date().toISOString()
        })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        status: "success",
        lead: { id: `lead_${Date.now()}`, ...body, createdAt: new Date().toISOString() }
      })
    };
  }

  // GET /api/leads
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      status: "success",
      message: "Leads API operational on Netlify Serverless Functions",
      timestamp: new Date().toISOString()
    })
  };
};
