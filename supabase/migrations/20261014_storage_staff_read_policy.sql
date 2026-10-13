-- Migration: 20261014_storage_staff_read_policy.sql
-- Description: Restrict SELECT on storage.objects for 'message-attachments' strictly to verified staff members

-- 1. Helper function to verify caller exists in staff directory
CREATE OR REPLACE FUNCTION public.is_staff_user(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  is_in_users BOOLEAN := false;
  has_staff_table BOOLEAN := false;
  is_in_staff BOOLEAN := false;
BEGIN
  IF user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check primary users table (organization members with role admin, manager, or staff)
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = user_id AND (role IS NULL OR role IN ('admin', 'manager', 'staff'))
  ) INTO is_in_users;

  IF is_in_users THEN
    RETURN true;
  END IF;

  -- Check if a custom public.staff table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'staff'
  ) INTO has_staff_table;

  IF has_staff_table THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.staff WHERE id = $1 OR user_id = $1)'
    INTO is_in_staff
    USING user_id;
    IF is_in_staff THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN is_in_users;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

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
