-- ==============================================================================
-- DIRECT POSTGRES RLS VERIFICATION TEST SUITE
-- Tests RLS enforcement directly in Postgres engine (no API layer)
-- Verifies:
--   1. anon role cannot read leads, conversations, messages, notifications, meta_connections
--   2. Staff A (authenticated) cannot see Staff B's leads
--   3. Staff A (authenticated) cannot see Staff B's conversations
--   4. Staff A (authenticated) cannot see Staff B's messages
--   5. Staff A (authenticated) cannot see Staff B's notifications
--   6. Staff A (authenticated) cannot see Staff B's meta_connections
--   7. Admin can access org-wide records
-- ==============================================================================

BEGIN;

-- Ensure required roles exist in Postgres
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

-- Grant usage to schema public
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- Setup test UUIDs
DO $$
DECLARE
  v_org_id UUID := '00000000-0000-0000-0000-000000000001';
  v_user_a UUID := '00000000-0000-0000-0000-00000000000a';
  v_user_b UUID := '00000000-0000-0000-0000-00000000000b';
  v_user_adm UUID := '00000000-0000-0000-0000-0000000000ad';
  v_lead_a TEXT := 'lead_test_a';
  v_lead_b TEXT := 'lead_test_b';
  v_conv_a UUID := '00000000-0000-0000-0000-000000000ca1';
  v_conv_b UUID := '00000000-0000-0000-0000-000000000cb1';
  v_msg_a UUID := '00000000-0000-0000-0000-000000000ma1';
  v_msg_b UUID := '00000000-0000-0000-0000-000000000mb1';
  v_notif_a UUID := '00000000-0000-0000-0000-000000000na1';
  v_notif_b UUID := '00000000-0000-0000-0000-000000000nb1';
  v_conn_a UUID := '00000000-0000-0000-0000-000000000ea1';
  v_conn_b UUID := '00000000-0000-0000-0000-000000000eb1';
BEGIN
  -- Insert mock organization
  INSERT INTO public.organizations (id, name, slug)
  VALUES (v_org_id, 'Test Org', 'test-org')
  ON CONFLICT (id) DO NOTHING;

  -- Insert mock auth users if auth.users exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, email) VALUES
      (v_user_a, 'staff_a@metacrm.io'),
      (v_user_b, 'staff_b@metacrm.io'),
      (v_user_adm, 'admin@metacrm.io')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Insert mock users
  INSERT INTO public.users (id, organization_id, name, email, role, status) VALUES
    (v_user_a, v_org_id, 'Staff A', 'staff_a@metacrm.io', 'staff', 'active'),
    (v_user_b, v_org_id, 'Staff B', 'staff_b@metacrm.io', 'staff', 'active'),
    (v_user_adm, v_org_id, 'Admin User', 'admin@metacrm.io', 'admin', 'active')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  -- Insert mock pages
  INSERT INTO public.meta_pages (id, organization_id, meta_page_id, name) VALUES
    ('page_01', v_org_id, '10001', 'Page One (Staff A)'),
    ('page_02', v_org_id, '10002', 'Page Two (Staff B)')
  ON CONFLICT (id) DO NOTHING;

  -- Assign Page 01 to Staff A, Page 02 to Staff B
  INSERT INTO public.staff_pages (organization_id, staff_id, page_id) VALUES
    (v_org_id, v_user_a, 'page_01'),
    (v_org_id, v_user_b, 'page_02')
  ON CONFLICT DO NOTHING;

  -- Seed Meta Connections
  INSERT INTO public.meta_connections (id, organization_id, user_id, meta_user_id, meta_user_name, access_token) VALUES
    (v_conn_a, v_org_id, v_user_a, 'meta_a', 'Staff A Meta', 'token_a'),
    (v_conn_b, v_org_id, v_user_b, 'meta_b', 'Staff B Meta', 'token_b')
  ON CONFLICT DO NOTHING;

  -- Seed Leads
  INSERT INTO public.leads (id, organization_id, page_id, assigned_to, name, email, status) VALUES
    (v_lead_a, v_org_id, 'page_01', v_user_a, 'Lead for A', 'lead_a@example.com', 'new'),
    (v_lead_b, v_org_id, 'page_02', v_user_b, 'Lead for B', 'lead_b@example.com', 'new')
  ON CONFLICT (id) DO NOTHING;

  -- Seed Conversations
  INSERT INTO public.conversations (id, organization_id, page_id, assigned_to, channel, customer_psid, customer_name) VALUES
    (v_conv_a, v_org_id, 'page_01', v_user_a, 'messenger', 'psid_a', 'Customer A'),
    (v_conv_b, v_org_id, 'page_02', v_user_b, 'messenger', 'psid_b', 'Customer B')
  ON CONFLICT (id) DO NOTHING;

  -- Seed Messages
  INSERT INTO public.messages (id, conversation_id, sender_type, sender_name, text) VALUES
    (v_msg_a, v_conv_a, 'customer', 'Customer A', 'Secret message for Staff A'),
    (v_msg_b, v_conv_b, 'customer', 'Customer B', 'Secret message for Staff B')
  ON CONFLICT (id) DO NOTHING;

  -- Seed Notifications
  INSERT INTO public.notifications (id, organization_id, user_id, title, message) VALUES
    (v_notif_a, v_org_id, v_user_a, 'Notif for A', 'Private alert A'),
    (v_notif_b, v_org_id, v_user_b, 'Notif for B', 'Private alert B')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- TEST SUITE 1: Direct Anon Role Access (Bypassing API layer with Anon Key)
-- -----------------------------------------------------------------------------
SET LOCAL ROLE anon;
RESET request.jwt.claim.sub;
RESET request.jwt.claims;

DO $$
DECLARE
  cnt INT;
BEGIN
  -- Test 1a: Anon cannot see any leads
  SELECT count(*) INTO cnt FROM public.leads;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'RLS LEAK! anon role can see % leads directly in Postgres', cnt;
  END IF;

  -- Test 1b: Anon cannot see any conversations
  SELECT count(*) INTO cnt FROM public.conversations;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'RLS LEAK! anon role can see % conversations directly in Postgres', cnt;
  END IF;

  -- Test 1c: Anon cannot see any messages
  SELECT count(*) INTO cnt FROM public.messages;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'RLS LEAK! anon role can see % messages directly in Postgres', cnt;
  END IF;

  -- Test 1d: Anon cannot see any notifications
  SELECT count(*) INTO cnt FROM public.notifications;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'RLS LEAK! anon role can see % notifications directly in Postgres', cnt;
  END IF;

  -- Test 1e: Anon cannot see any meta_connections
  SELECT count(*) INTO cnt FROM public.meta_connections;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'RLS LEAK! anon role can see % meta_connections directly in Postgres', cnt;
  END IF;

  RAISE NOTICE 'SUCCESS: Anon role has 0 access to all tables directly in Postgres.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST SUITE 2: Staff A Authenticated Role Isolation (Direct Postgres)
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000000a';
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

DO $$
DECLARE
  v_user_b UUID := '00000000-0000-0000-0000-00000000000b';
  cnt INT;
BEGIN
  -- Test 2a: Staff A CANNOT see Staff B's lead
  SELECT count(*) INTO cnt FROM public.leads WHERE assigned_to = v_user_b OR page_id = 'page_02';
  IF cnt > 0 THEN
    RAISE EXCEPTION 'RLS LEAK! Staff A can see Staff B leads directly in Postgres (count: %)', cnt;
  END IF;

  -- Test 2b: Staff A CANNOT see Staff B's conversations
  SELECT count(*) INTO cnt FROM public.conversations WHERE page_id = 'page_02';
  IF cnt > 0 THEN
    RAISE EXCEPTION 'RLS LEAK! Staff A can see Staff B conversations directly in Postgres (count: %)', cnt;
  END IF;

  -- Test 2c: Staff A CANNOT see Staff B's messages
  SELECT count(*) INTO cnt FROM public.messages m
  JOIN public.conversations c ON m.conversation_id = c.id
  WHERE c.page_id = 'page_02';
  IF cnt > 0 THEN
    RAISE EXCEPTION 'RLS LEAK! Staff A can see Staff B messages directly in Postgres (count: %)', cnt;
  END IF;

  -- Test 2d: Staff A CANNOT see Staff B's notifications
  SELECT count(*) INTO cnt FROM public.notifications WHERE user_id = v_user_b;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'RLS LEAK! Staff A can see Staff B notifications directly in Postgres (count: %)', cnt;
  END IF;

  -- Test 2e: Staff A CANNOT see Staff B's meta_connections
  SELECT count(*) INTO cnt FROM public.meta_connections WHERE user_id = v_user_b;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'RLS LEAK! Staff A can see Staff B meta_connections directly in Postgres (count: %)', cnt;
  END IF;

  -- Test 2f: Staff A CAN see their own lead
  SELECT count(*) INTO cnt FROM public.leads WHERE page_id = 'page_01';
  IF cnt = 0 THEN
    RAISE EXCEPTION 'RLS ERROR! Staff A cannot see their own assigned lead in Postgres';
  END IF;

  -- Test 2g: Staff A CAN see their own conversation
  SELECT count(*) INTO cnt FROM public.conversations WHERE page_id = 'page_01';
  IF cnt = 0 THEN
    RAISE EXCEPTION 'RLS ERROR! Staff A cannot see their own conversation in Postgres';
  END IF;

  -- Test 2h: Staff A CAN see their own messages
  SELECT count(*) INTO cnt FROM public.messages;
  IF cnt = 0 THEN
    RAISE EXCEPTION 'RLS ERROR! Staff A cannot see their own conversation messages in Postgres';
  END IF;

  -- Test 2i: Staff A CAN see their own notifications
  SELECT count(*) INTO cnt FROM public.notifications;
  IF cnt = 0 THEN
    RAISE EXCEPTION 'RLS ERROR! Staff A cannot see their own notifications in Postgres';
  END IF;

  RAISE NOTICE 'SUCCESS: Staff A isolation fully verified directly in Postgres.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST SUITE 3: Admin Authenticated Role Access
-- -----------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000ad';
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}';

DO $$
DECLARE
  cnt INT;
BEGIN
  -- Admin sees both leads
  SELECT count(*) INTO cnt FROM public.leads;
  IF cnt < 2 THEN
    RAISE EXCEPTION 'RLS ERROR! Admin expected at least 2 leads, saw %', cnt;
  END IF;

  -- Admin sees both conversations
  SELECT count(*) INTO cnt FROM public.conversations;
  IF cnt < 2 THEN
    RAISE EXCEPTION 'RLS ERROR! Admin expected at least 2 conversations, saw %', cnt;
  END IF;

  RAISE NOTICE 'SUCCESS: Admin role successfully accesses org-wide records.';
END $$;

ROLLBACK;
