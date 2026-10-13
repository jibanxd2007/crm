-- Migration: 20261014_storage_staff_read_policy.sql
-- Description: Restrict access on storage.objects for 'message-attachments' strictly to verified staff members

-- 1. Helper function to verify caller exists in staff directory with hardened search_path
CREATE OR REPLACE FUNCTION public.is_staff_user(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = user_id
      AND role IN ('admin', 'super_admin', 'manager', 'staff', 'owner')
  );
$$;

-- 2. Restrict execute permissions on the helper function
REVOKE EXECUTE ON FUNCTION public.is_staff_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_user(UUID) TO authenticated;

-- 3. Drop unconstrained SELECT policies on message-attachments
DROP POLICY IF EXISTS "Authenticated staff read message-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Staff read message-attachments" ON storage.objects;

-- 4. Create restricted policy requiring caller to be present in staff directory
CREATE POLICY "Staff read message-attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND public.is_staff_user(auth.uid())
  );

-- 5. Harden write policies on message-attachments to verify staff membership
DROP POLICY IF EXISTS "Authenticated insert for message-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow signed and auth uploads for message-attachments" ON storage.objects;

CREATE POLICY "Staff insert message-attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND public.is_staff_user(auth.uid())
  );

DROP POLICY IF EXISTS "Allow signed and auth updates for message-attachments" ON storage.objects;

CREATE POLICY "Staff update message-attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND public.is_staff_user(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND public.is_staff_user(auth.uid())
  );
