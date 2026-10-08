-- ==============================================================================
-- PHASE A — SPEED-TO-LEAD MIGRATION
-- Notifications, Write-Once first_response_at, SLA Compliance & Hot-Lead System
-- ==============================================================================

-- 1. Notifications Table with Strict User-Level RLS (No Cross-User Leaks)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('new_lead', 'hot_lead', 'sla_breach', 'task_due', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications(created_at DESC);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. Add Speed-to-Lead Columns to public.leads
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_target_minutes INT DEFAULT 5,
  ADD COLUMN IF NOT EXISTS is_hot_lead BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_value NUMERIC(12,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_leads_first_response ON public.leads(first_response_at);
CREATE INDEX IF NOT EXISTS idx_leads_is_hot ON public.leads(is_hot_lead);

-- 3. Write-Once DB Enforcement Trigger for first_response_at
CREATE OR REPLACE FUNCTION public.enforce_first_response_at_write_once()
RETURNS TRIGGER AS $$
BEGIN
  -- If first_response_at was already set and is being modified, preserve original timestamp
  IF OLD.first_response_at IS NOT NULL AND NEW.first_response_at IS DISTINCT FROM OLD.first_response_at THEN
    NEW.first_response_at := OLD.first_response_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leads_first_response_once ON public.leads;
CREATE TRIGGER trg_leads_first_response_once
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_first_response_at_write_once();

-- 4. User Notification Preferences (In-app, Email stub, Slack webhook, Hot Lead threshold)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"in_app": true, "email": false, "slack_webhook_url": null, "hot_lead_threshold": 50000}'::jsonb;
