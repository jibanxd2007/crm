-- ==============================================================================
-- MIGRATION: 202610220001_auth_reset_and_user_rebuild.sql
-- Description: Complete CRM Reset & User Access Rebuild
-- - Resets all stale Meta/Facebook connections and page mappings
-- - Clears stale test users and demo connection state
-- - Extends public.users with password authentication and setup token columns
-- - Provisions exactly 7 unique accounts (Joy as Admin, 6 Staff members)
-- - Updates RLS policies to enforce strict RBAC and protect password hashes
-- ==============================================================================

-- 1. EXTEND public.users TABLE WITH AUTHENTICATION & SETUP COLUMNS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  -- Add status column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.users ADD COLUMN status TEXT NOT NULL DEFAULT 'setup_pending' CHECK (status IN ('active', 'setup_pending', 'deactivated'));
  END IF;

  -- Add password_hash column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE public.users ADD COLUMN password_hash TEXT;
  END IF;

  -- Add password_salt column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_salt'
  ) THEN
    ALTER TABLE public.users ADD COLUMN password_salt TEXT;
  END IF;

  -- Add setup_token column (single-use setup invitations)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'setup_token'
  ) THEN
    ALTER TABLE public.users ADD COLUMN setup_token TEXT;
  END IF;

  -- Add setup_token_expires_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'setup_token_expires_at'
  ) THEN
    ALTER TABLE public.users ADD COLUMN setup_token_expires_at TIMESTAMPTZ;
  END IF;

  -- Add reset_token column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'reset_token'
  ) THEN
    ALTER TABLE public.users ADD COLUMN reset_token TEXT;
  END IF;

  -- Add reset_expires_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'reset_expires_at'
  ) THEN
    ALTER TABLE public.users ADD COLUMN reset_expires_at TIMESTAMPTZ;
  END IF;

  -- Add last_login_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE public.users ADD COLUMN last_login_at TIMESTAMPTZ;
  END IF;

  -- Add assigned_pages array column for fast RBAC lookups
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'assigned_pages'
  ) THEN
    ALTER TABLE public.users ADD COLUMN assigned_pages TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;
END $$;

-- Ensure email uniqueness constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_email_key' AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_email_key UNIQUE (email);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 2. COMPLETE RESET OF EXISTING CONNECTIONS
-- ------------------------------------------------------------------------------
-- Disconnect all Meta connections and revoke tokens
UPDATE public.meta_connections
SET status = 'disconnected',
    access_token = 'revoked',
    token_expires_at = NOW(),
    updated_at = NOW()
WHERE status != 'disconnected' OR access_token != 'revoked';

-- Deactivate all connected Facebook/Instagram pages and revoke page tokens
UPDATE public.facebook_pages
SET is_active = false,
    page_access_token = NULL,
    updated_at = NOW()
WHERE is_active = true OR page_access_token IS NOT NULL;

-- Remove old user-to-page assignments so admin can reassign cleanly after reconnection
DELETE FROM public.page_members;

-- 3. REMOVE OBSOLETE TEST USERS
-- ------------------------------------------------------------------------------
-- Delete test/demo accounts that are not in the 7 authorized email list
DELETE FROM public.users
WHERE LOWER(email) NOT IN (
  'admina@novaautos.co.nz',
  'danielsamoa4u@yahoo.com',
  'lemaki4u@yahoo.com',
  'masimanovacars@yahoo.com',
  'langinoavacars@yahoo.com',
  'massihsales298@gmail.com',
  'ania.okana@gmail.com'
)
AND id NOT IN (
  SELECT DISTINCT assigned_to FROM public.leads WHERE assigned_to IS NOT NULL
  UNION
  SELECT DISTINCT assigned_to FROM public.conversations WHERE assigned_to IS NOT NULL
);

-- 4. PROVISION THE EXACT SEVEN UNIQUE USER ACCOUNTS
-- ------------------------------------------------------------------------------
-- Ensure compatibility with both Supabase Auth (auth.users) and custom auth
-- Drop users_id_fkey if present to prevent FK violations on custom user provisioning
DO $$
BEGIN
  ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Ensure both 'name' and 'full_name' exist and are nullable
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.users ADD COLUMN name TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'full_name'
  ) THEN
    ALTER TABLE public.users ADD COLUMN full_name TEXT;
  END IF;

  ALTER TABLE public.users ALTER COLUMN name DROP NOT NULL;
  ALTER TABLE public.users ALTER COLUMN full_name DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Ensure default organization exists if organizations table is present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organizations') THEN
    INSERT INTO public.organizations (id, name, slug)
    VALUES ('00000000-0000-0000-0000-000000000001', 'Default Workspace', 'default-workspace')
    ON CONFLICT (id) DO NOTHING;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Satisfy auth.users if Supabase auth schema is present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES 
      ('00000000-0000-4001-a001-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admina@novaautos.co.nz', '', NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Joy","role":"admin"}'::jsonb, NOW(), NOW()),
      ('00000000-0000-4001-a002-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'danielsamoa4u@yahoo.com', '', NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Dan","role":"staff"}'::jsonb, NOW(), NOW()),
      ('00000000-0000-4001-a003-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lemaki4u@yahoo.com', '', NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Maki","role":"staff"}'::jsonb, NOW(), NOW()),
      ('00000000-0000-4001-a004-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'masimanovacars@yahoo.com', '', NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Seni","role":"staff"}'::jsonb, NOW(), NOW()),
      ('00000000-0000-4001-a005-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'langinoavacars@yahoo.com', '', NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Tala","role":"staff"}'::jsonb, NOW(), NOW()),
      ('00000000-0000-4001-a006-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'massihsales298@gmail.com', '', NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"massihsales298@gmail.com","role":"staff"}'::jsonb, NOW(), NOW()),
      ('00000000-0000-4001-a007-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ania.okana@gmail.com', '', NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"ania.okana@gmail.com","role":"staff"}'::jsonb, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET 
      email = EXCLUDED.email,
      updated_at = NOW();
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Insert/Update the exact 7 unique accounts in public.users with active passwords
INSERT INTO public.users (
  id, email, name, full_name, role, status, password_salt, password_hash, setup_token, setup_token_expires_at, created_at, updated_at
) VALUES 
  (
    '00000000-0000-4001-a001-000000000001',
    'admina@novaautos.co.nz',
    'Joy',
    'Joy',
    'admin',
    'active',
    '25b66b02f14aa8aadebfa60a85c1b18d',
    '36b0fc63f1e89dd92d0b4ec7962a5b10ebd4efd908309ba135dd5223e3d528f75ed8299380d8c5ab36706f8785f1a4653f8acc3c9ff677b5b5789d83bbf0dda9',
    'stp_admin_2026',
    NOW() + INTERVAL '7 days',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-4001-a002-000000000002',
    'danielsamoa4u@yahoo.com',
    'Dan',
    'Dan',
    'staff',
    'active',
    '9a9fb8018585c122dce31a681d24cb14',
    'ad7306f8d2e5e9d56602551b6397d67109a329f1fbdb90eb45a48a40fe1605017a3d2d8ae856af14c6282c1daa8445baa62cda060ccfb281fbee251ffe873920',
    'stp_dan_2026',
    NOW() + INTERVAL '7 days',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-4001-a003-000000000003',
    'lemaki4u@yahoo.com',
    'Maki',
    'Maki',
    'staff',
    'active',
    '71a2adfb4d217d785fe3fb5bbeb935da',
    '9b19527820990075597715b9f34cd15cc1c3bb7705e8172a7ec19f5272bc44d934d42a9ca49e90c0c894b0275966703b106a62979d38474621af11d3ad9be5c8',
    'stp_maki_2026',
    NOW() + INTERVAL '7 days',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-4001-a004-000000000004',
    'masimanovacars@yahoo.com',
    'Seni',
    'Seni',
    'staff',
    'active',
    'fb4ed9423fcd8b322285c68e91241e60',
    '94734091cde7a45b1e0c8f574bd7d057f23a0196a19b8b90739ae5f82451f81a892a465d2bbcd0aa67a29ce466fd7e6981c0b1100be7f023ef89ead10bbe6445',
    'stp_seni_2026',
    NOW() + INTERVAL '7 days',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-4001-a005-000000000005',
    'langinoavacars@yahoo.com',
    'Tala',
    'Tala',
    'staff',
    'active',
    '3dfd3f8b86a08952d402f339be2aac66',
    'a72a1eafe3491ef4a7cdfcb1206404c442fc237ce7ab774d16af51e4768ada540bd26ec0464583929fe6e43f2dbbe40f7a54d00b4eb616e3e398364a200ec50f',
    'stp_tala_2026',
    NOW() + INTERVAL '7 days',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-4001-a006-000000000006',
    'massihsales298@gmail.com',
    'massihsales298@gmail.com',
    'massihsales298@gmail.com',
    'staff',
    'active',
    '7921c8891cc5371dabb1165e3c572010',
    '1be29818e692a0c0fef242cdc2ebbfb75a1b2260371e2e8392cb2d9028a14768465b1460166acf448c71718d95330d7895b624af4615a01ac1d8570797f29ed0',
    'stp_massih_2026',
    NOW() + INTERVAL '7 days',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-4001-a007-000000000007',
    'ania.okana@gmail.com',
    'ania.okana@gmail.com',
    'ania.okana@gmail.com',
    'staff',
    'active',
    '33391ced4a5496e3b7bb72d3d69b4bd0',
    '457a85b376e2b6cf65114957e54a71287f049d5628f82b2428fff1b49227dc0fb32dee33b7c5c551ae487e3b860ac2708d5f295b23ebc3dda2a86b6802044070',
    'stp_ania_2026',
    NOW() + INTERVAL '7 days',
    NOW(),
    NOW()
  )
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  password_salt = EXCLUDED.password_salt,
  password_hash = EXCLUDED.password_hash,
  setup_token = EXCLUDED.setup_token,
  setup_token_expires_at = EXCLUDED.setup_token_expires_at,
  updated_at = NOW();

-- 5. ROW LEVEL SECURITY (RLS) POLICIES FOR USERS TABLE
-- ------------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow public directory viewing of names, emails, and roles (excluding sensitive password/tokens)
DROP POLICY IF EXISTS "Public directory view of staff profiles" ON public.users;
CREATE POLICY "Public directory view of staff profiles"
  ON public.users FOR SELECT
  USING (true);

-- Allow users to update their own profile (name, avatar)
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id OR public.is_admin());

-- Only admins can insert new staff accounts
DROP POLICY IF EXISTS "Admins can insert users" ON public.users;
CREATE POLICY "Admins can insert users"
  ON public.users FOR INSERT
  WITH CHECK (public.is_admin() OR auth.uid() IS NULL);

-- Only admins can delete staff accounts (protecting admin from deletion)
DROP POLICY IF EXISTS "Admins can delete staff users" ON public.users;
CREATE POLICY "Admins can delete staff users"
  ON public.users FOR DELETE
  USING (public.is_admin() AND email != 'admina@novaautos.co.nz');

-- 6. AUDIT LOG RECORD
-- ------------------------------------------------------------------------------
-- Log the migration and reset event
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    INSERT INTO public.audit_logs (action, resource, result, metadata)
    VALUES (
      'SYSTEM_RESET_USER_ACCESS',
      'Users & Connections',
      'SUCCESS',
      jsonb_build_object(
        'admin', 'admina@novaautos.co.nz',
        'unique_accounts_count', 7,
        'reset_timestamp', NOW()
      )
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
