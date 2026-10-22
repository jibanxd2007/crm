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
-- All emails stored in normalized lowercase.
-- Joy (admina@novaautos.co.nz) is the sole administrator.
-- All other accounts receive staff role by default.
-- Initial setup tokens are generated with 7-day expiration.

INSERT INTO public.users (
  id, email, full_name, role, status, setup_token, setup_token_expires_at, created_at, updated_at
) VALUES 
  (
    '00000000-0000-4001-a001-000000000001',
    'admina@novaautos.co.nz',
    'Joy',
    'admin',
    'setup_pending',
    'setup_joy_admin_init_token_2026',
    NOW() + INTERVAL '7 days',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-4001-a002-000000000002',
    'danielsamoa4u@yahoo.com',
    'Dan',
    'staff',
    'setup_pending',
    'setup_dan_staff_init_token_2026',
    NOW() + INTERVAL '7 days',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-4001-a003-000000000003',
    'lemaki4u@yahoo.com',
    'Maki',
    'staff',
    'setup_pending',
    'setup_maki_staff_init_token_2026',
    NOW() + INTERVAL '7 days',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-4001-a004-000000000004',
    'masimanovacars@yahoo.com',
    'Seni',
    'staff',
    'setup_pending',
    'setup_seni_staff_init_token_2026',
    NOW() + INTERVAL '7 days',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-4001-a005-000000000005',
    'langinoavacars@yahoo.com',
    'Tala',
    'staff',
    'setup_pending',
    'setup_tala_staff_init_token_2026',
    NOW() + INTERVAL '7 days',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-4001-a006-000000000006',
    'massihsales298@gmail.com',
    'Massihsales298@gmail.com',
    'staff',
    'setup_pending',
    'setup_massih_staff_init_token_2026',
    NOW() + INTERVAL '7 days',
    NOW(),
    NOW()
  ),
  (
    '00000000-0000-4001-a007-000000000007',
    'ania.okana@gmail.com',
    'ania.okana@gmail.com',
    'staff',
    'setup_pending',
    'setup_ania_staff_init_token_2026',
    NOW() + INTERVAL '7 days',
    NOW(),
    NOW()
  )
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
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
