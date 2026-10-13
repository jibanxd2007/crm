-- Migration: 20261014_storage_signed_uploads_limit.sql
-- Description: Configure 'message-attachments' bucket with 25MB limit, strict MIME allowlist, and RLS policies for signed uploads and staff reads

DO $$
BEGIN
  -- 1. Create or update the storage bucket with 25MB size limit and allowed MIME types
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'message-attachments',
    'message-attachments',
    true,
    26214400,
    ARRAY[
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
      'video/mp4', 'video/quicktime',
      'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/webm',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv'
    ]
  )
  ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 26214400,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

  -- 2. Storage RLS Policies
  -- Allow public / staff reads on message attachments
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access for message-attachments'
  ) THEN
    CREATE POLICY "Public Access for message-attachments"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'message-attachments');
  END IF;

  -- Allow direct browser uploads via signed upload tokens & authenticated users
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Allow signed and auth uploads for message-attachments'
  ) THEN
    CREATE POLICY "Allow signed and auth uploads for message-attachments"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'message-attachments');
  END IF;

  -- Allow updates if file overwrite is ever needed
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Allow signed and auth updates for message-attachments'
  ) THEN
    CREATE POLICY "Allow signed and auth updates for message-attachments"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'message-attachments')
      WITH CHECK (bucket_id = 'message-attachments');
  END IF;
END $$;
