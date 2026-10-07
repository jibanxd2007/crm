-- ==============================================================================
-- PRODUCTION BASELINE CONFIGURATION (NO FAKE DATA)
-- Sets up default pipeline preferences and webhook settings.
-- Real pages, campaigns, ad accounts, and leads will be populated only
-- when a user authenticates with Meta or receives real webhooks.
-- ==============================================================================

INSERT INTO public.crm_settings (organization_id, key, value)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'pipeline_stages', '["new", "contacted", "qualified", "proposal", "won", "lost"]'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'auto_assignment', '{"enabled": true, "strategy": "round_robin"}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'sync_frequency_minutes', '15'::jsonb)
ON CONFLICT (organization_id, key) DO UPDATE
SET value = EXCLUDED.value, updated_at = NOW();
