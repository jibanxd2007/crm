exports.handler = async function(event, context) {
  const staff = [
    { id: "usr_admin_01", name: "Ananya Sen", email: "admin@metacrm.io", role: "admin", assignedPageIds: ["page_01", "page_02", "page_03", "page_04", "page_05", "page_06"], status: "active" },
    { id: "user_02", name: "Rahul Sharma", email: "rahul@metacrm.io", role: "staff", assignedPageIds: ["page_01", "page_03"], status: "active" },
    { id: "user_03", name: "Amit Patel", email: "amit@metacrm.io", role: "staff", assignedPageIds: ["page_02"], status: "active" },
    { id: "user_04", name: "Priya Nair", email: "priya@metacrm.io", role: "staff", assignedPageIds: ["page_04", "page_05"], status: "active" },
    { id: "user_05", name: "Vikram Malhotra", email: "vikram@metacrm.io", role: "staff", assignedPageIds: ["page_06"], status: "active" },
    { id: "user_06", name: "Sneha Rao", email: "sneha@metacrm.io", role: "staff", assignedPageIds: ["page_01", "page_02"], status: "active" },
    { id: "user_07", name: "Rohan Gupta", email: "rohan@metacrm.io", role: "staff", assignedPageIds: ["page_03", "page_05"], status: "active" }
  ];

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      status: "success",
      count: staff.length,
      staff: staff,
      timestamp: new Date().toISOString()
    })
  };
};
