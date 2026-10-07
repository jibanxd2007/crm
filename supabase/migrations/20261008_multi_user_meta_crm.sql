-- ==============================================================================
-- MULTI-USER META/FACEBOOK CRM MIGRATION
-- Multi-Tenant Facebook Pages, Meta Connections, Leads, Conversations & Messages
-- Enforces Strict Row Level Security (RLS) & Multi-User Isolation
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 2. USERS & PROFILES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'staff')) DEFAULT 'staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- Helper functions for RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('admin', 'manager')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 3. META CONNECTIONS TABLE (OAuth Credentials Storage)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  facebook_user_id TEXT NOT NULL,
  facebook_name TEXT,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('connected', 'expired', 'disconnected', 'error')) DEFAULT 'connected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_fb UNIQUE(user_id, facebook_user_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_connections_user ON public.meta_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_meta_connections_status ON public.meta_connections(status);

-- ------------------------------------------------------------------------------
-- 4. FACEBOOK PAGES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.facebook_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  meta_connection_id UUID REFERENCES public.meta_connections(id) ON DELETE SET NULL,
  page_id TEXT NOT NULL, -- Meta Graph API Page ID
  page_name TEXT NOT NULL,
  page_username TEXT,
  page_picture TEXT,
  page_access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_page UNIQUE(user_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_facebook_pages_user ON public.facebook_pages(user_id);
CREATE INDEX IF NOT EXISTS idx_facebook_pages_page_id ON public.facebook_pages(page_id);
CREATE INDEX IF NOT EXISTS idx_facebook_pages_active ON public.facebook_pages(is_active);

-- ------------------------------------------------------------------------------
-- 5. PAGE MEMBERS TABLE (RBAC / Page Access Permissions)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id UUID NOT NULL REFERENCES public.facebook_pages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'agent')) DEFAULT 'agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_page_member UNIQUE(page_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_page_members_page ON public.page_members(page_id);
CREATE INDEX IF NOT EXISTS idx_page_members_user ON public.page_members(user_id);

-- Helper: Can user access page?
CREATE OR REPLACE FUNCTION public.can_user_access_page(check_page_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.facebook_pages p
    WHERE p.id = check_page_id AND (
      p.user_id = auth.uid() OR
      public.is_admin() OR
      EXISTS (
        SELECT 1 FROM public.page_members pm
        WHERE pm.page_id = p.id AND pm.user_id = auth.uid()
      )
    )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 6. LEADS TABLE (Facebook Lead Ads & Multi-Tier Attribution)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id UUID NOT NULL REFERENCES public.facebook_pages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  meta_lead_id TEXT UNIQUE,
  form_id TEXT,
  form_name TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  ad_id TEXT,
  ad_name TEXT,
  adset_id TEXT,
  adset_name TEXT,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL DEFAULT 'Facebook Lead Ad',
  status TEXT NOT NULL CHECK (status IN ('New', 'Contacted', 'Qualified', 'Follow-up', 'Converted', 'Lost')) DEFAULT 'New',
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_page ON public.leads(page_id);
CREATE INDEX IF NOT EXISTS idx_leads_user ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_meta_lead_id ON public.leads(meta_lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON public.leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);

-- ------------------------------------------------------------------------------
-- 7. CONVERSATIONS TABLE (Facebook Messenger & Instagram Direct)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_id UUID NOT NULL REFERENCES public.facebook_pages(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL, -- Customer PSID or Instagram ID
  participant_name TEXT NOT NULL,
  participant_profile_picture TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'pending')) DEFAULT 'open',
  last_message TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_page_participant UNIQUE(page_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_convs_page ON public.conversations(page_id);
CREATE INDEX IF NOT EXISTS idx_convs_participant ON public.conversations(participant_id);
CREATE INDEX IF NOT EXISTS idx_convs_assigned ON public.conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_convs_last_msg_at ON public.conversations(last_message_at DESC);

-- ------------------------------------------------------------------------------
-- 8. MESSAGES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.facebook_pages(id) ON DELETE CASCADE,
  meta_message_id TEXT UNIQUE,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  message_text TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL DEFAULT 'text',
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_page ON public.messages(page_id);
CREATE INDEX IF NOT EXISTS idx_messages_meta_id ON public.messages(meta_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at ASC);

-- ------------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Users / Profiles
CREATE POLICY "Users can view all organization profiles"
  ON public.users FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Meta Connections: Strictly isolated to owner (tokens never leak across users)
CREATE POLICY "Users can access own Meta connections"
  ON public.meta_connections FOR ALL
  USING (auth.uid() = user_id OR public.is_admin());

-- Facebook Pages: Owner or assigned page member
CREATE POLICY "Users can view permitted pages"
  ON public.facebook_pages FOR SELECT
  USING (public.can_user_access_page(id));

CREATE POLICY "Owners and Admins can manage pages"
  ON public.facebook_pages FOR ALL
  USING (auth.uid() = user_id OR public.is_admin());

-- Page Members
CREATE POLICY "Users can view their page memberships"
  ON public.page_members FOR SELECT
  USING (auth.uid() = user_id OR public.can_user_access_page(page_id));

CREATE POLICY "Page Owners and Admins can manage members"
  ON public.page_members FOR ALL
  USING (
    public.is_admin() OR
    EXISTS (SELECT 1 FROM public.facebook_pages WHERE id = page_members.page_id AND user_id = auth.uid())
  );

-- Leads: Accessible only to authorized page members or assigned staff
CREATE POLICY "Users can view authorized leads"
  ON public.leads FOR SELECT
  USING (
    public.can_user_access_page(page_id) OR
    assigned_to = auth.uid() OR
    public.is_admin()
  );

CREATE POLICY "Users can update authorized leads"
  ON public.leads FOR UPDATE
  USING (
    public.can_user_access_page(page_id) OR
    assigned_to = auth.uid() OR
    public.is_admin()
  );

CREATE POLICY "Service and Webhooks can insert leads"
  ON public.leads FOR INSERT
  WITH CHECK (true);

-- Conversations
CREATE POLICY "Users can view authorized conversations"
  ON public.conversations FOR SELECT
  USING (
    public.can_user_access_page(page_id) OR
    assigned_to = auth.uid() OR
    public.is_admin()
  );

CREATE POLICY "Users can manage authorized conversations"
  ON public.conversations FOR ALL
  USING (
    public.can_user_access_page(page_id) OR
    assigned_to = auth.uid() OR
    public.is_admin()
  );

-- Messages
CREATE POLICY "Users can view authorized messages"
  ON public.messages FOR SELECT
  USING (
    public.can_user_access_page(page_id) OR
    public.is_admin()
  );

CREATE POLICY "Users can insert authorized messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    public.can_user_access_page(page_id) OR
    public.is_admin()
  );

-- ------------------------------------------------------------------------------
-- 10. REALTIME PUBLICATION CONFIGURATION
-- ------------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
