-- Migration: 20261014_storage_staff_read_policy.sql
-- Description: Restrict SELECT on storage.objects for 'message-attachments' strictly to verified staff members

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
      AND role IN ('admin', 'manager', 'staff')
  );
$$;

-- 2. Drop unconstrained SELECT policies on message-attachments
DROP POLICY IF EXISTS "Authenticated staff read message-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Staff read message-attachments" ON storage.objects;

-- 3. Create restricted policy requiring caller to be present in staff directory
CREATE POLICY "Staff read message-attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'message-attachments'
    AND public.is_staff_user(auth.uid())
  );
