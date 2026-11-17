-- ==============================================================================
-- MIGRATION: 202611180001_dealership_workflow_and_lead_ingestion.sql
-- Purpose: Additive dealership workflow, Lead Ads ingestion durability,
--          page-scoped contacts, atomic round-robin assignment, and human vs
--          automated response tracking for Nova Autos NZ.
-- Safe to run multiple times (idempotent DDL).
-- ==============================================================================

-- 1. Page-scoped Contacts (separates a person from individual vehicle enquiries)
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  page_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  normalized_email TEXT,
  phone TEXT,
  normalized_phone TEXT,
  external_psid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_page_email
  ON public.contacts (page_id, normalized_email)
  WHERE normalized_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_page_phone
  ON public.contacts (page_id, normalized_phone)
  WHERE normalized_phone IS NOT NULL;

-- 2. Durable Provider Webhook Events (for idempotency, retries & ingestion health)
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL DEFAULT 'zernio',
  event_type TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  page_id TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'duplicate', 'failed')),
  payload JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_webhook_provider_event UNIQUE (provider, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status_created
  ON public.webhook_events (status, created_at DESC);

-- 3. Atomic Round-Robin Assignment Cursors per Page
CREATE TABLE IF NOT EXISTS public.page_assignment_cursors (
  page_id TEXT PRIMARY KEY,
  last_assigned_user_id UUID,
  cursor_index INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Additive Dealership & Attribution Columns on public.leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vehicle_interest TEXT,
  ADD COLUMN IF NOT EXISTS budget_nzd NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS payment_preference TEXT,
  ADD COLUMN IF NOT EXISTS trade_in_info TEXT,
  ADD COLUMN IF NOT EXISTS buying_timeframe TEXT,
  ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_action_note TEXT,
  ADD COLUMN IF NOT EXISTS appointment_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appointment_status TEXT,
  ADD COLUMN IF NOT EXISTS human_first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_ack_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attribution_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS loss_reason TEXT,
  ADD COLUMN IF NOT EXISTS sale_value_nzd NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS messaging_eligible BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_contact_id ON public.leads (contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_page_created ON public.leads (page_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_appointment ON public.leads (appointment_at) WHERE appointment_at IS NOT NULL;

-- 5. Additive Ad Attribution Columns on public.conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ad_id TEXT,
  ADD COLUMN IF NOT EXISTS campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS ad_referral JSONB,
  ADD COLUMN IF NOT EXISTS linked_lead_id UUID;

-- 5b. Meta Ads Accounts, Campaigns & Daily Insights (Zernio Sync Storage)
CREATE TABLE IF NOT EXISTS public.ad_accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'zernio',
  zernio_account_id TEXT,
  page_id TEXT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NZD',
  account_status TEXT,
  is_nzd BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id TEXT PRIMARY KEY,
  ad_account_id TEXT REFERENCES public.ad_accounts(id) ON DELETE SET NULL,
  page_id TEXT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  currency TEXT NOT NULL DEFAULT 'NZD',
  spend NUMERIC(12, 2) NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  platform_leads INTEGER NOT NULL DEFAULT 0,
  messaging_connections INTEGER NOT NULL DEFAULT 0,
  date_since DATE,
  date_until DATE,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ad_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  page_id TEXT,
  date_since DATE NOT NULL,
  date_until DATE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NZD',
  spend NUMERIC(12, 2) NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  platform_leads INTEGER NOT NULL DEFAULT 0,
  messaging_connections INTEGER NOT NULL DEFAULT 0,
  raw_actions JSONB DEFAULT '[]'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ad_insights_campaign_window UNIQUE (ad_account_id, campaign_id, date_since, date_until)
);

CREATE INDEX IF NOT EXISTS idx_ad_insights_window ON public.ad_insights (date_since, date_until);
CREATE INDEX IF NOT EXISTS idx_campaigns_page_id ON public.campaigns (page_id);

-- 6. Atomic Round-Robin Function (prevents concurrent workers assigning conflicting owners)
CREATE OR REPLACE FUNCTION public.assign_next_eligible_staff(
  p_page_id TEXT,
  p_eligible_user_ids UUID[]
)
RETURNS UUID AS $$
DECLARE
  v_count INTEGER;
  v_next_idx INTEGER;
  v_selected UUID;
BEGIN
  v_count := COALESCE(array_length(p_eligible_user_ids, 1), 0);
  IF v_count = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.page_assignment_cursors (page_id, cursor_index)
  VALUES (p_page_id, 0)
  ON CONFLICT (page_id) DO NOTHING;

  SELECT cursor_index INTO v_next_idx
  FROM public.page_assignment_cursors
  WHERE page_id = p_page_id
  FOR UPDATE;

  v_selected := p_eligible_user_ids[(v_next_idx % v_count) + 1];

  UPDATE public.page_assignment_cursors
  SET cursor_index = v_next_idx + 1,
      last_assigned_user_id = v_selected,
      updated_at = NOW()
  WHERE page_id = p_page_id;

  RETURN v_selected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Strict RLS Policies for Page Isolation
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_assignment_cursors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contacts_select_policy ON public.contacts;
CREATE POLICY contacts_select_policy ON public.contacts
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.page_members pm
      JOIN public.facebook_pages fp ON fp.id = pm.page_id
      WHERE pm.user_id = auth.uid()
        AND (fp.id::text = contacts.page_id OR fp.page_id = contacts.page_id)
    )
  );

DROP POLICY IF EXISTS contacts_write_policy ON public.contacts;
CREATE POLICY contacts_write_policy ON public.contacts
  FOR ALL USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.page_members pm
      JOIN public.facebook_pages fp ON fp.id = pm.page_id
      WHERE pm.user_id = auth.uid()
        AND (fp.id::text = contacts.page_id OR fp.page_id = contacts.page_id)
    )
  );

DROP POLICY IF EXISTS webhook_events_admin_only ON public.webhook_events;
CREATE POLICY webhook_events_admin_only ON public.webhook_events
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS page_assignment_cursors_admin_only ON public.page_assignment_cursors;
CREATE POLICY page_assignment_cursors_admin_only ON public.page_assignment_cursors
  FOR ALL USING (public.is_admin());

ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ad_accounts_admin_only ON public.ad_accounts;
CREATE POLICY ad_accounts_admin_only ON public.ad_accounts FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS campaigns_admin_only ON public.campaigns;
CREATE POLICY campaigns_admin_only ON public.campaigns FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS ad_insights_admin_only ON public.ad_insights;
CREATE POLICY ad_insights_admin_only ON public.ad_insights FOR ALL USING (public.is_admin());

-- ==============================================================================
-- ROLLBACK INSTRUCTIONS (Reversible):
-- ==============================================================================
-- DROP TABLE IF EXISTS public.ad_insights;
-- DROP TABLE IF EXISTS public.campaigns;
-- DROP TABLE IF EXISTS public.ad_accounts;
-- DROP FUNCTION IF EXISTS public.assign_next_eligible_staff(TEXT, UUID[]);
-- DROP TABLE IF EXISTS public.page_assignment_cursors;
-- DROP TABLE IF EXISTS public.webhook_events;
-- ALTER TABLE public.leads
--   DROP COLUMN IF EXISTS contact_id,
--   DROP COLUMN IF EXISTS custom_fields,
--   DROP COLUMN IF EXISTS vehicle_interest,
--   DROP COLUMN IF EXISTS budget_nzd,
--   DROP COLUMN IF EXISTS payment_preference,
--   DROP COLUMN IF EXISTS trade_in_info,
--   DROP COLUMN IF EXISTS buying_timeframe,
--   DROP COLUMN IF EXISTS next_action_at,
--   DROP COLUMN IF EXISTS next_action_note,
--   DROP COLUMN IF EXISTS appointment_at,
--   DROP COLUMN IF EXISTS appointment_status,
--   DROP COLUMN IF EXISTS human_first_response_at,
--   DROP COLUMN IF EXISTS auto_ack_sent_at,
--   DROP COLUMN IF EXISTS attribution_status,
--   DROP COLUMN IF EXISTS loss_reason,
--   DROP COLUMN IF EXISTS sale_value_nzd,
--   DROP COLUMN IF EXISTS messaging_eligible;
-- DROP TABLE IF EXISTS public.contacts;
-- ALTER TABLE public.conversations
--   DROP COLUMN IF EXISTS ad_id,
--   DROP COLUMN IF EXISTS campaign_id,
--   DROP COLUMN IF EXISTS ad_referral,
--   DROP COLUMN IF EXISTS linked_lead_id;
