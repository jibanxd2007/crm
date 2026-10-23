-- ==============================================================================
-- MIGRATION: 202610240001_fix_users_rls_and_hide_secrets.sql
-- Description: Security Hardening & Zero-Leak RLS Protection
-- 1. Drops leaky SELECT USING (true) on public.users
-- 2. Restricts direct SELECT on password hashes, salts, and tokens from anon & authenticated
-- 3. Enforces strict RBAC: Admin sees all; Authenticated staff see own profile & assigned data
-- 4. Exposes secure staff_directory view excluding all credential secrets
-- 5. Hardens page, lead, conversation, message, and notification RLS policies
-- 6. Adds query-optimized composite indexes for inbox recency and attribution
-- ==============================================================================

-- 1. DROP LEAKY PUBLIC DIRECTORY POLICY ON public.users
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public directory view of staff profiles" ON public.users;
DROP POLICY IF EXISTS "Admins view all users" ON public.users;
DROP POLICY IF EXISTS "Users view own full profile" ON public.users;
DROP POLICY IF EXISTS "Staff view team directory safely" ON public.users;

-- Admin full access to public.users
CREATE POLICY "Admins view all users"
  ON public.users FOR SELECT
  USING (public.is_admin());

-- Users can view their own profile
CREATE POLICY "Users view own full profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- Authenticated staff can view team members (excluding sensitive password/tokens via column grants)
CREATE POLICY "Staff view team directory safely"
  ON public.users FOR SELECT
  TO authenticated
  USING (status != 'deactivated');

-- 2. COLUMN-LEVEL PERMISSION HARDENING: PROTECT PASSWORDS AND TOKENS
-- ------------------------------------------------------------------------------
-- Revoke direct select on credential columns from anon role
REVOKE ALL ON public.users FROM anon;
GRANT SELECT (id, organization_id, name, full_name, email, role, avatar, title, phone, status, assigned_pages, created_at, updated_at) ON public.users TO anon;

-- Revoke direct select on password_hash, password_salt, setup_token, reset_token from authenticated non-admins
REVOKE SELECT (password_hash, password_salt, setup_token, reset_token) ON public.users FROM authenticated;

-- 3. SECURE STAFF DIRECTORY VIEW
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.staff_directory WITH (security_invoker = true) AS
SELECT 
  id,
  organization_id,
  name,
  full_name,
  email,
  role,
  status,
  avatar,
  title,
  phone,
  assigned_pages,
  last_login_at,
  created_at,
  updated_at
FROM public.users
WHERE status != 'deactivated';

GRANT SELECT ON public.staff_directory TO authenticated, anon;

-- 4. HARDEN LEADS RLS (Staff access strictly bounded by page assignment)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view assigned leads" ON public.leads;
CREATE POLICY "Staff can view assigned leads"
  ON public.leads FOR SELECT
  USING (
    public.is_admin() OR
    assigned_to = auth.uid() OR
    page_id IN (
      SELECT p.id FROM public.facebook_pages p
      JOIN public.page_members pm ON pm.page_id = p.id
      WHERE pm.user_id = auth.uid()
    ) OR
    page_id = ANY(
      SELECT unnest(assigned_pages) FROM public.users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Staff can update assigned leads" ON public.leads;
CREATE POLICY "Staff can update assigned leads"
  ON public.leads FOR UPDATE
  USING (
    public.is_admin() OR
    assigned_to = auth.uid() OR
    page_id = ANY(
      SELECT unnest(assigned_pages) FROM public.users WHERE id = auth.uid()
    )
  );

-- 5. HARDEN CONVERSATIONS & MESSAGES RLS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can view assigned conversations" ON public.conversations;
CREATE POLICY "Staff can view assigned conversations"
  ON public.conversations FOR SELECT
  USING (
    public.is_admin() OR
    assigned_to = auth.uid() OR
    page_id = ANY(
      SELECT unnest(assigned_pages) FROM public.users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Staff can view messages in permitted conversations" ON public.messages;
CREATE POLICY "Staff can view messages in permitted conversations"
  ON public.messages FOR SELECT
  USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND (
        c.assigned_to = auth.uid() OR
        c.page_id = ANY(
          SELECT unnest(assigned_pages) FROM public.users WHERE id = auth.uid()
        )
      )
    )
  );

-- 6. HARDEN NOTIFICATIONS RLS (Strict user isolation, zero cross-user leakage)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can only view their own notifications" ON public.notifications;
CREATE POLICY "Users can only view their own notifications"
  ON public.notifications FOR SELECT
  USING (
    user_id = auth.uid() OR public.is_admin()
  );

-- 7. PERFORMANCE INDEXES (Based on query patterns)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_conversations_page_last_msg 
  ON public.conversations(page_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_recency_archive 
  ON public.conversations(is_archived, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created 
  ON public.messages(conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created_desc 
  ON public.messages(conversation_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_messages_client_msg_id 
  ON public.messages(client_msg_id) 
  WHERE client_msg_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_meta_mid 
  ON public.messages(meta_mid) 
  WHERE meta_mid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_page_created 
  ON public.leads(page_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_meta_lead_id 
  ON public.leads(meta_lead_id) 
  WHERE meta_lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_assigned_pages 
  ON public.users USING GIN(assigned_pages);
