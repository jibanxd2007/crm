-- ==============================================================================
-- METACRM PRODUCTION DATABASE SCHEMA (POSTGRESQL / SUPABASE)
-- Multi-Tenant Workspaces, Real Meta Assets, RBAC, RLS, Webhooks, Audit Logs
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. ORGANIZATIONS / WORKSPACES (Tenant Isolation)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'production',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default organization for single-tenant or initial setup
INSERT INTO public.organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Workspace', 'default-workspace')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. USERS & ROLES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'manager')),
  avatar TEXT,
  title TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_org ON public.users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- Helper functions for RLS
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('admin', 'manager')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 3. META CONNECTIONS (OAUTH STATE & CREDENTIALS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  meta_user_id TEXT NOT NULL,
  meta_user_name TEXT NOT NULL,
  meta_user_email TEXT,
  access_token TEXT NOT NULL, -- Encrypted or stored server-side
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_error TEXT,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_meta_user UNIQUE (organization_id, meta_user_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_connections_org ON public.meta_connections(organization_id);

-- ------------------------------------------------------------------------------
-- 4. REAL META PAGES (Facebook & Connected Instagram)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_pages (
  id TEXT PRIMARY KEY, -- 'page_' || meta_page_id
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  connection_id UUID REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  meta_page_id TEXT NOT NULL,
  name TEXT NOT NULL,
  username TEXT,
  category TEXT,
  avatar_url TEXT,
  page_access_token TEXT, -- Encrypted Page Access Token for Lead Ads API
  tasks TEXT[] DEFAULT '{}',
  is_connected BOOLEAN NOT NULL DEFAULT true,
  webhook_subscribed BOOLEAN NOT NULL DEFAULT false,
  ig_business_account_id TEXT,
  ig_username TEXT,
  followers_count INTEGER DEFAULT 0,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_page_id UNIQUE (organization_id, meta_page_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_pages_org ON public.meta_pages(organization_id);
CREATE INDEX IF NOT EXISTS idx_meta_pages_connected ON public.meta_pages(is_connected);

-- ------------------------------------------------------------------------------
-- 5. INSTAGRAM ACCOUNTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instagram_accounts (
  id TEXT PRIMARY KEY, -- 'ig_' || ig_id
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  page_id TEXT REFERENCES public.meta_pages(id) ON DELETE CASCADE,
  ig_id TEXT NOT NULL,
  username TEXT NOT NULL,
  name TEXT,
  profile_picture_url TEXT,
  followers_count INTEGER DEFAULT 0,
  media_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 6. AD ACCOUNTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_accounts (
  id TEXT PRIMARY KEY, -- 'act_' || meta_ad_account_id
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  connection_id UUID REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  meta_ad_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  timezone_name TEXT DEFAULT 'UTC',
  account_status INTEGER DEFAULT 1, -- 1 = ACTIVE, 2 = DISABLED
  amount_spent NUMERIC(14,2) DEFAULT 0.00,
  business_name TEXT,
  is_connected BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_ad_account UNIQUE (organization_id, meta_ad_account_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_accounts_org ON public.ad_accounts(organization_id);

-- ------------------------------------------------------------------------------
-- 7. CAMPAIGNS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id TEXT PRIMARY KEY, -- 'cmp_' || meta_campaign_id
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  ad_account_id TEXT REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES public.meta_pages(id) ON DELETE SET NULL,
  meta_campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED')),
  daily_budget NUMERIC(12,2) DEFAULT 0.00,
  lifetime_budget NUMERIC(12,2) DEFAULT 0.00,
  start_time TIMESTAMPTZ,
  stop_time TIMESTAMPTZ,
  
  -- Cached Insights
  total_spend NUMERIC(12,2) DEFAULT 0.00,
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr NUMERIC(6,3) DEFAULT 0.000,
  cpc NUMERIC(10,2) DEFAULT 0.00,
  cpm NUMERIC(10,2) DEFAULT 0.00,
  leads INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_campaign UNIQUE (organization_id, meta_campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_ad_acc ON public.campaigns(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);

-- ------------------------------------------------------------------------------
-- 8. AD SETS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_sets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT REFERENCES public.campaigns(id) ON DELETE CASCADE,
  meta_adset_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  daily_budget NUMERIC(12,2) DEFAULT 0.00,
  lifetime_budget NUMERIC(12,2) DEFAULT 0.00,
  billing_event TEXT,
  optimization_goal TEXT,
  targeting_summary TEXT,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 9. ADS & CREATIVES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ads (
  id TEXT PRIMARY KEY,
  adset_id TEXT REFERENCES public.ad_sets(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES public.campaigns(id) ON DELETE CASCADE,
  page_id TEXT REFERENCES public.meta_pages(id) ON DELETE SET NULL,
  meta_ad_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED')),
  creative_id TEXT,
  creative_thumbnail TEXT,
  headline TEXT,
  body TEXT,
  format TEXT DEFAULT 'Single Image',
  lead_form_name TEXT,
  spend NUMERIC(12,2) DEFAULT 0.00,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  leads INTEGER DEFAULT 0,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 10. LEAD FORMS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_forms (
  id TEXT PRIMARY KEY, -- 'form_' || meta_form_id
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  page_id TEXT REFERENCES public.meta_pages(id) ON DELETE CASCADE,
  meta_form_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  questions JSONB DEFAULT '[]',
  leads_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 11. LEADS (CENTRAL CRM PIPELINE)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id TEXT PRIMARY KEY DEFAULT ('lead_' || uuid_generate_v4()),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  meta_lead_id TEXT UNIQUE, -- Real Meta leadgen_id duplicate protection
  
  -- Contact Information
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  
  -- Meta Attribution Cascade
  page_id TEXT REFERENCES public.meta_pages(id) ON DELETE SET NULL,
  ad_account_id TEXT REFERENCES public.ad_accounts(id) ON DELETE SET NULL,
  campaign_id TEXT REFERENCES public.campaigns(id) ON DELETE SET NULL,
  adset_id TEXT REFERENCES public.ad_sets(id) ON DELETE SET NULL,
  ad_id TEXT REFERENCES public.ads(id) ON DELETE SET NULL,
  form_id TEXT REFERENCES public.lead_forms(id) ON DELETE SET NULL,
  form_name TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  source TEXT NOT NULL DEFAULT 'Meta Lead Ads',
  
  -- Raw Form Field Answers from Meta Graph API
  field_data JSONB DEFAULT '[]',
  
  -- CRM Pipeline & Assignment
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  estimated_value NUMERIC(12,2) DEFAULT 0.00,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_contacted_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_leads_org ON public.leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_page ON public.leads(page_id);
CREATE INDEX IF NOT EXISTS idx_leads_meta_id ON public.leads(meta_lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_created ON public.leads(created_at DESC);

-- ------------------------------------------------------------------------------
-- 12. NOTES, ACTIVITIES & CRM AUDIT TRAIL
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id TEXT PRIMARY KEY DEFAULT ('note_' || uuid_generate_v4()),
  lead_id TEXT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_lead ON public.lead_notes(lead_id);

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id TEXT PRIMARY KEY DEFAULT ('act_' || uuid_generate_v4()),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  lead_id TEXT REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  author_name TEXT,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'lead_created', 'assigned', 'status_changed', 'note_added',
    'contact_made', 'tag_added', 'converted', 'lost', 'meta_sync'
  )),
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_lead ON public.crm_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_org ON public.crm_activities(organization_id);

-- ------------------------------------------------------------------------------
-- 13. WEBHOOK EVENTS (MONITORING & IDEMPOTENCY)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id TEXT PRIMARY KEY DEFAULT ('whevt_' || uuid_generate_v4()),
  event_type TEXT NOT NULL,
  object_id TEXT,
  signature_verified BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'duplicate', 'failed')),
  payload JSONB NOT NULL,
  error_details TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON public.webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_obj ON public.webhook_events(object_id);

-- ------------------------------------------------------------------------------
-- 14. SYSTEM AUDIT LOGS (SECURITY & USER ACTIONS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY DEFAULT ('log_' || uuid_generate_v4()),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- 15. SYNC JOBS (SCHEDULED & MANUAL SYNC JOBS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_jobs (
  id TEXT PRIMARY KEY DEFAULT ('job_' || uuid_generate_v4()),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  job_type TEXT NOT NULL CHECK (job_type IN ('insights_sync', 'leads_sync', 'pages_sync', 'forms_sync')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'delayed')),
  assets_synced JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ------------------------------------------------------------------------------
-- 16. SETTINGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_settings (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, key)
);

-- ------------------------------------------------------------------------------
-- 18. CONTACTS (HubSpot-style Customer Records)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  location TEXT,
  source TEXT,
  platform TEXT,
  page_id TEXT REFERENCES public.meta_pages(id) ON DELETE SET NULL,
  campaign_id TEXT,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  lifecycle_stage TEXT NOT NULL DEFAULT 'lead' CHECK (lifecycle_stage IN ('subscriber', 'lead', 'marketing_qualified', 'sales_qualified', 'opportunity', 'customer', 'evangelist')),
  custom_fields JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_org ON public.contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(email);

-- ------------------------------------------------------------------------------
-- 19. STAFF PAGES (Page-Based Access Control)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  staff_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL REFERENCES public.meta_pages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_staff_page UNIQUE (staff_id, page_id)
);

-- ------------------------------------------------------------------------------
-- 20. PIPELINES & PIPELINE STAGES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipelines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  pipeline_type TEXT NOT NULL DEFAULT 'lead' CHECK (pipeline_type IN ('lead', 'sales', 'deals', 'onboarding')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  probability NUMERIC NOT NULL DEFAULT 100,
  color TEXT NOT NULL DEFAULT '#98E85E',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 21. DEALS (Sales Opportunities with Monetary Values)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  page_id TEXT REFERENCES public.meta_pages(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  loss_reason TEXT,
  close_date TIMESTAMPTZ,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 22. LEAD STAGE HISTORY (Audited Progression Trail)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_stage_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  previous_stage TEXT,
  new_stage TEXT NOT NULL,
  changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 23. UNIFIED INBOX (Conversations & Messages)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  page_id TEXT REFERENCES public.meta_pages(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('messenger', 'instagram', 'whatsapp')),
  customer_psid TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_avatar TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  unread_count INT NOT NULL DEFAULT 0,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'snoozed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_channel_customer UNIQUE (page_id, customer_psid)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'staff', 'system')),
  sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  text TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 24. SCRUM SPRINTS & TASKS MODULE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sprints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  goal TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planning', 'active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  sprint_id UUID REFERENCES public.sprints(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  stage TEXT NOT NULL DEFAULT 'todo' CHECK (stage IN ('backlog', 'todo', 'in_progress', 'review', 'done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date TIMESTAMPTZ,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  related_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  related_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  related_deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  related_page_id TEXT REFERENCES public.meta_pages(id) ON DELETE SET NULL,
  checklist JSONB DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 25. FOLLOW-UPS ENGINE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.followups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'overdue')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 26. CRM AUTOMATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  action_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID REFERENCES public.automations(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL,
  details TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Strict multi-tenant isolation and staff role restriction
-- ==============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;

-- Leads: Admins see all in org; Staff see only assigned
CREATE POLICY "Admins have full access to org leads"
  ON public.leads FOR ALL
  USING (organization_id = public.current_user_org_id() AND public.is_admin());

CREATE POLICY "Staff can view assigned leads"
  ON public.leads FOR SELECT
  USING (organization_id = public.current_user_org_id() AND (assigned_to = auth.uid() OR EXISTS (
    SELECT 1 FROM public.staff_pages WHERE staff_id = auth.uid() AND staff_pages.page_id = leads.page_id
  )));

CREATE POLICY "Staff can update assigned leads"
  ON public.leads FOR UPDATE
  USING (organization_id = public.current_user_org_id() AND assigned_to = auth.uid())
  WITH CHECK (organization_id = public.current_user_org_id() AND assigned_to = auth.uid());

-- Contacts: Org level access
CREATE POLICY "Users can access org contacts"
  ON public.contacts FOR ALL
  USING (organization_id = public.current_user_org_id());

-- Conversations: Staff see assigned page conversations
CREATE POLICY "Users access conversations"
  ON public.conversations FOR ALL
  USING (organization_id = public.current_user_org_id());

CREATE POLICY "Users access messages"
  ON public.messages FOR ALL
  USING (TRUE);

-- Tasks & Pipelines: Full access in Org
CREATE POLICY "Users access tasks"
  ON public.tasks FOR ALL
  USING (organization_id = public.current_user_org_id());

CREATE POLICY "Users access pipelines"
  ON public.pipelines FOR ALL
  USING (organization_id = public.current_user_org_id());

CREATE POLICY "Users access deals"
  ON public.deals FOR ALL
  USING (organization_id = public.current_user_org_id());

-- Pages & Ads: Org-level isolation
CREATE POLICY "Users can access org meta pages"
  ON public.meta_pages FOR ALL
  USING (organization_id = public.current_user_org_id());

CREATE POLICY "Users can access org ad accounts"
  ON public.ad_accounts FOR ALL
  USING (organization_id = public.current_user_org_id());

CREATE POLICY "Users can access org campaigns"
  ON public.campaigns FOR ALL
  USING (organization_id = public.current_user_org_id());

CREATE POLICY "Users can access org audit logs"
  ON public.audit_logs FOR SELECT
  USING (organization_id = public.current_user_org_id());

-- ==============================================================================
-- REALTIME PUBLICATION
-- ==============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_activities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_events;
