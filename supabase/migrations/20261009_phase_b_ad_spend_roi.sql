-- ==============================================================================
-- Migration: Phase B - Ad Spend Sync & True ROI Tracking
-- Date: 2026-10-09
-- Purpose: Store granular Meta Graph ad insights (spend, clicks, impressions, ctr,
--          cpc, cpm) mapped to attribution IDs on leads (campaign_id, adset_id, ad_id)
--          with strict multi-user page-scoped Row Level Security (RLS).
-- ==============================================================================

-- 1. Create ad_insights Table
CREATE TABLE IF NOT EXISTS public.ad_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id UUID REFERENCES public.facebook_pages(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  campaign_id TEXT,
  campaign_name TEXT,
  adset_id TEXT,
  adset_name TEXT,
  ad_id TEXT,
  ad_name TEXT,
  date_start DATE NOT NULL,
  date_stop DATE NOT NULL,
  spend NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  impressions BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  ctr NUMERIC(6, 4) DEFAULT 0.0000,
  cpc NUMERIC(10, 2) DEFAULT 0.00,
  cpm NUMERIC(10, 2) DEFAULT 0.00,
  conversions INT DEFAULT 0,
  raw_data JSONB DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indices for fast lookups and attribution matching
CREATE INDEX IF NOT EXISTS idx_ad_insights_page ON public.ad_insights(page_id);
CREATE INDEX IF NOT EXISTS idx_ad_insights_campaign ON public.ad_insights(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_insights_adset ON public.ad_insights(adset_id);
CREATE INDEX IF NOT EXISTS idx_ad_insights_ad ON public.ad_insights(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_insights_dates ON public.ad_insights(date_start, date_stop);

-- 3. Unique index for idempotent daily upserts
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_insights_daily_idx 
  ON public.ad_insights(ad_account_id, COALESCE(campaign_id, ''), COALESCE(adset_id, ''), COALESCE(ad_id, ''), date_start);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.ad_insights ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: Staff view only their assigned Facebook pages; Admins view all
DROP POLICY IF EXISTS "ad_insights_select_policy" ON public.ad_insights;
CREATE POLICY "ad_insights_select_policy" ON public.ad_insights
  FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR
    page_id IN (
      SELECT page_id FROM public.page_members WHERE user_id = auth.uid()
    )
  );

-- Admins and service role can insert/update insights
DROP POLICY IF EXISTS "ad_insights_write_policy" ON public.ad_insights;
CREATE POLICY "ad_insights_write_policy" ON public.ad_insights
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- 6. Realtime Publication
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_insights;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
