/**
 * MetaCRM Production Data Store & Seed Catalog
 * 
 * Clean production architecture ready for real Meta Graph API & Supabase integration.
 * Zero demo/mock data: populated dynamically via OAuth, Webhooks, and User Management.
 */

const LEAD_STATUSES = [
  { id: "New", label: "New", color: "blue", bg: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "Contacted", label: "Contacted", color: "amber", bg: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "Interested", label: "Interested", color: "cyan", bg: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  { id: "Qualified", label: "Qualified", color: "purple", bg: "bg-purple-50 text-purple-700 border-purple-200" },
  { id: "Follow-up", label: "Follow-up", color: "indigo", bg: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { id: "Converted", label: "Converted", color: "emerald", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "Lost", label: "Lost", color: "rose", bg: "bg-rose-50 text-rose-700 border-rose-200" },
  { id: "Invalid", label: "Invalid", color: "slate", bg: "bg-slate-100 text-slate-600 border-slate-300" }
];

const LEAD_SOURCES = [
  "Facebook Lead Ads",
  "Instagram Lead Ads",
  "Facebook Organic",
  "Instagram Organic",
  "Website",
  "WhatsApp",
  "Manual Entry",
  "Referral",
  "Other"
];

const DATE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7d", label: "Last 7 Days" },
  { id: "last_30d", label: "Last 30 Days" },
  { id: "this_month", label: "This Month" },
  { id: "custom", label: "Custom Range" }
];

const META_PERMISSIONS_CATALOG = [
  { scope: "public_profile", label: "Public Profile", category: "Identity", reviewRequired: false },
  { scope: "email", label: "Email Address", category: "Identity", reviewRequired: false },
  { scope: "pages_show_list", label: "Pages Show List", category: "Pages API", reviewRequired: true },
  { scope: "pages_read_engagement", label: "Pages Read Engagement", category: "Pages API", reviewRequired: true },
  { scope: "pages_manage_ads", label: "Pages Manage Ads", category: "Marketing API", reviewRequired: true },
  { scope: "pages_manage_metadata", label: "Pages Manage Metadata", category: "Webhooks", reviewRequired: true },
  { scope: "leads_retrieval", label: "Leads Retrieval", category: "Lead Ads", reviewRequired: true },
  { scope: "ads_read", label: "Ads Read", category: "Marketing API", reviewRequired: true },
  { scope: "ads_management", label: "Ads Management", category: "Marketing API", reviewRequired: true },
  { scope: "business_management", label: "Business Management", category: "Business API", reviewRequired: true }
];

const PAGES_DATA = [];
const STAFF_DATA = [];
const CAMPAIGNS_DATA = [];
const ADSETS_DATA = [];
const ADS_DATA = [];
const LEADS_DATA = [];
const CONTACTS_DATA = [];
const DEALS_DATA = [];

const PIPELINES_DATA = [
  {
    id: "pipeline_default",
    name: "Standard Sales Pipeline",
    pipeline_type: "lead",
    is_default: true,
    stages: [
      { id: "stg_new", name: "New Lead", order_index: 0, probability: 10, color: "#3B82F6" },
      { id: "stg_contacted", name: "Contacted", order_index: 1, probability: 30, color: "#F59E0B" },
      { id: "stg_interested", name: "Interested", order_index: 2, probability: 50, color: "#06B6D4" },
      { id: "stg_qualified", name: "Qualified", order_index: 3, probability: 70, color: "#8B5CF6" },
      { id: "stg_followup", name: "Follow-up", order_index: 4, probability: 85, color: "#6366F1" },
      { id: "stg_won", name: "Closed Won", order_index: 5, probability: 100, color: "#10B981" },
      { id: "stg_lost", name: "Closed Lost", order_index: 6, probability: 0, color: "#EF4444" }
    ]
  },
  {
    id: "pipeline_enterprise",
    name: "Enterprise Deals Pipeline",
    pipeline_type: "deals",
    is_default: false,
    stages: [
      { id: "stg_ent_discovery", name: "Discovery", order_index: 0, probability: 20, color: "#3B82F6" },
      { id: "stg_ent_demo", name: "Demo Scheduled", order_index: 1, probability: 40, color: "#06B6D4" },
      { id: "stg_ent_proposal", name: "Proposal Sent", order_index: 2, probability: 60, color: "#8B5CF6" },
      { id: "stg_ent_negotiation", name: "Negotiation", order_index: 3, probability: 80, color: "#F59E0B" },
      { id: "stg_ent_won", name: "Won", order_index: 4, probability: 100, color: "#10B981" },
      { id: "stg_ent_lost", name: "Lost", order_index: 5, probability: 0, color: "#EF4444" }
    ]
  }
];

const TASKS_DATA = [];
const SPRINTS_DATA = [];
const CONVERSATIONS_DATA = [];
const AUTOMATIONS_DATA = [];

const INITIAL_DATA = {
  pages: PAGES_DATA,
  staff: STAFF_DATA,
  campaigns: CAMPAIGNS_DATA,
  adsets: ADSETS_DATA,
  ads: ADS_DATA,
  leads: LEADS_DATA,
  contacts: CONTACTS_DATA,
  deals: DEALS_DATA,
  pipelines: PIPELINES_DATA,
  tasks: TASKS_DATA,
  sprints: SPRINTS_DATA,
  conversations: CONVERSATIONS_DATA,
  automations: AUTOMATIONS_DATA,
  followups: [],
  auditLogs: [],
  notifications: []
};

const INITIAL_META_CONFIG = {
  appId: "",
  appSecret: "",
  apiVersion: "v24.0",
  redirectUri: typeof window !== "undefined" ? window.location.origin + "/api/meta/callback" : "",
  webhookEndpoint: typeof window !== "undefined" ? window.location.origin + "/api/webhooks/meta" : "/api/webhooks/meta",
  verifyToken: "meta_crm_wh_verify_secret_2026",
  autoSyncIntervalMinutes: 15,
  lastSyncTimestamp: new Date().toISOString(),
  autoAssignmentEnabled: true,
  assignmentStrategy: "round_robin"
};

if (typeof window !== "undefined") {
  window.LEAD_STATUSES = LEAD_STATUSES;
  window.LEAD_SOURCES = LEAD_SOURCES;
  window.DATE_PRESETS = DATE_PRESETS;
  window.META_PERMISSIONS_CATALOG = META_PERMISSIONS_CATALOG;
  window.PAGES_DATA = PAGES_DATA;
  window.STAFF_DATA = STAFF_DATA;
  window.CAMPAIGNS_DATA = CAMPAIGNS_DATA;
  window.ADSETS_DATA = ADSETS_DATA;
  window.ADS_DATA = ADS_DATA;
  window.LEADS_DATA = LEADS_DATA;
  window.CONTACTS_DATA = CONTACTS_DATA;
  window.DEALS_DATA = DEALS_DATA;
  window.PIPELINES_DATA = PIPELINES_DATA;
  window.TASKS_DATA = TASKS_DATA;
  window.SPRINTS_DATA = SPRINTS_DATA;
  window.CONVERSATIONS_DATA = CONVERSATIONS_DATA;
  window.AUTOMATIONS_DATA = AUTOMATIONS_DATA;
  window.INITIAL_DATA = INITIAL_DATA;
  window.INITIAL_META_CONFIG = INITIAL_META_CONFIG;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LEAD_STATUSES,
    LEAD_SOURCES,
    DATE_PRESETS,
    META_PERMISSIONS_CATALOG,
    PAGES_DATA,
    STAFF_DATA,
    CAMPAIGNS_DATA,
    ADSETS_DATA,
    ADS_DATA,
    LEADS_DATA,
    CONTACTS_DATA,
    DEALS_DATA,
    PIPELINES_DATA,
    TASKS_DATA,
    SPRINTS_DATA,
    CONVERSATIONS_DATA,
    AUTOMATIONS_DATA,
    INITIAL_DATA,
    INITIAL_META_CONFIG
  };
}