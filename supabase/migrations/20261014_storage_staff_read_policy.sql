-- Migration: 20261014_storage_staff_read_policy.sql
-- Description: Ensure authenticated staff can SELECT from storage.objects for 'message-attachments' bucket

DO $$
BEGIN
  -- 1. Ensure SELECT policy for authenticated role exists on message-attachments bucket
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Authenticated staff read message-attachments'
  ) THEN
    CREATE POLICY "Authenticated staff read message-attachments"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'message-attachments');
  END IF;

  -- 2. Ensure public SELECT policy exists as well (for browser CDN / direct access)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Public Access for message-attachments'
  ) THEN
    CREATE POLICY "Public Access for message-attachments"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'message-attachments');
  END IF;
END $$;
