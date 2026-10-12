-- ==============================================================================
-- MULTI-CLIENT META ADS & EMAIL INTEGRATIONS MIGRATION
-- Multi-Provider Integration Settings, Lead Attribution, Gmail/Outlook, RLS
-- ==============================================================================

-- 1. Multi-Provider Integrations Table (Centralized Connection Registry)
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  provider TEXT NOT NULL CHECK (provider IN ('meta_ads', 'google_email', 'microsoft_email', 'meta_pages')),
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'expired', 'error')),
  credentials JSONB DEFAULT '{}'::jsonb,
  scopes JSONB DEFAULT '[]'::jsonb,
  assigned_staff_ids JSONB DEFAULT '[]'::jsonb,
  last_synced_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_integrations_provider_account UNIQUE (organization_id, provider, account_id)
);

CREATE INDEX IF NOT EXISTS idx_integrations_org ON public.integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON public.integrations(provider);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON public.integrations(status);

-- 2. Email Accounts (Google Workspace & Microsoft 365)
CREATE TABLE IF NOT EXISTS public.email_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  email TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'expired', 'error')),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  assigned_staff_ids JSONB DEFAULT '[]'::jsonb,
  sync_cursor TEXT,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_email_accounts_org_email UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_email_accounts_org ON public.email_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON public.email_accounts(email);

-- 3. Email Messages (Synced & Sent Emails with CRM Lead Associations)
CREATE TABLE IF NOT EXISTS public.email_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  provider_message_id TEXT NOT NULL,
  thread_id TEXT,
  folder TEXT NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox', 'sent', 'drafts', 'archive', 'trash')),
  direction TEXT NOT NULL DEFAULT 'incoming' CHECK (direction IN ('incoming', 'outgoing')),
  from_address TEXT NOT NULL,
  from_name TEXT,
  to_addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses JSONB DEFAULT '[]'::jsonb,
  bcc_addresses JSONB DEFAULT '[]'::jsonb,
  subject TEXT,
  snippet TEXT,
  body_html TEXT,
  body_text TEXT,
  has_attachments BOOLEAN DEFAULT FALSE,
  attachments JSONB DEFAULT '[]'::jsonb,
  is_read BOOLEAN DEFAULT FALSE,
  delivery_status TEXT DEFAULT 'delivered' CHECK (delivery_status IN ('pending', 'delivered', 'failed', 'bounced')),
  lead_id TEXT,
  contact_id TEXT,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_email_messages_account_provider_id UNIQUE (account_id, provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_email_messages_account ON public.email_messages(account_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_lead ON public.email_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_from ON public.email_messages(from_address);
CREATE INDEX IF NOT EXISTS idx_email_messages_received ON public.email_messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_folder ON public.email_messages(folder);

-- 4. Lead Ads Attribution & Provider Deduplication Columns on public.leads
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS campaign_name TEXT,
  ADD COLUMN IF NOT EXISTS adset_id TEXT,
  ADD COLUMN IF NOT EXISTS adset_name TEXT,
  ADD COLUMN IF NOT EXISTS ad_id TEXT,
  ADD COLUMN IF NOT EXISTS ad_name TEXT,
  ADD COLUMN IF NOT EXISTS form_id TEXT,
  ADD COLUMN IF NOT EXISTS form_name TEXT,
  ADD COLUMN IF NOT EXISTS meta_leadgen_id TEXT,
  ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'facebook';

CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_org_meta_leadgen_id 
  ON public.leads (organization_id, meta_leadgen_id) 
  WHERE meta_leadgen_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON public.leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_form_id ON public.leads(form_id);

-- 5. Ad Accounts & Campaigns Extended Columns for Multi-Client Management
ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS assigned_staff_ids JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS impressions BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reach BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ctr NUMERIC(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpc NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cpm NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leads INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_lead NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- 6. Ad Sets & Ads Tables for Detailed Drilldowns
CREATE TABLE IF NOT EXISTS public.ad_sets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  ad_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  daily_budget NUMERIC(12,2) DEFAULT 0,
  spend NUMERIC(12,2) DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  leads INT DEFAULT 0,
  cost_per_lead NUMERIC(10,2) DEFAULT 0,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ads (
  id TEXT PRIMARY KEY,
  adset_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  ad_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  creative_title TEXT,
  creative_body TEXT,
  creative_image_url TEXT,
  spend NUMERIC(12,2) DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  leads INT DEFAULT 0,
  cost_per_lead NUMERIC(10,2) DEFAULT 0,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_sets_campaign ON public.ad_sets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads_adset ON public.ads(adset_id);
CREATE INDEX IF NOT EXISTS idx_ads_campaign ON public.ads(campaign_id);

-- 7. Integration Sync Logs Table
CREATE TABLE IF NOT EXISTS public.integration_sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
  provider TEXT NOT NULL,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'in_progress')),
  items_synced INT DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_org ON public.integration_sync_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_provider ON public.integration_sync_logs(provider);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON public.integration_sync_logs(started_at DESC);

-- 8. Row Level Security (RLS) Enablement & Tenant Isolation Policies
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_logs ENABLE ROW LEVEL SECURITY;

-- Integrations RLS Policy: Admins see all tenant integrations; staff see only assigned accounts
CREATE POLICY "Admins have full access to integrations"
  ON public.integrations
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY "Staff can view assigned integrations"
  ON public.integrations
  FOR SELECT
  USING (
    assigned_staff_ids @> jsonb_build_array(auth.uid()::text)
    OR assigned_staff_ids = '[]'::jsonb
  );

-- Email Accounts RLS Policy
CREATE POLICY "Admins have full access to email accounts"
  ON public.email_accounts
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY "Staff can view and use assigned email accounts"
  ON public.email_accounts
  FOR SELECT
  USING (
    assigned_staff_ids @> jsonb_build_array(auth.uid()::text)
    OR assigned_staff_ids = '[]'::jsonb
  );

-- Email Messages RLS Policy
CREATE POLICY "Admins have full access to email messages"
  ON public.email_messages
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

CREATE POLICY "Staff can access messages for assigned accounts"
  ON public.email_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.email_accounts ea
      WHERE ea.id = email_messages.account_id
      AND (
        ea.assigned_staff_ids @> jsonb_build_array(auth.uid()::text)
        OR ea.assigned_staff_ids = '[]'::jsonb
      )
    )
  );

-- 9. Realtime Publication Additions for Push Updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'integrations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.integrations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'email_accounts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_accounts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'email_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_messages;
  END IF;
END $$;
