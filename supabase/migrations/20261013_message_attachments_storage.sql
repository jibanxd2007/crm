-- Migration: 20261013_message_attachments_storage.sql
-- Sets up Supabase Storage bucket 'message-attachments' and ensures messages table columns for media attachments

-- 1. Create or update storage bucket 'message-attachments' (25MB limit, public read for Meta Graph & frontend CDN access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  true,
  26214400,
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime',
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/aac',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 26214400;

-- 2. Storage Policies for message-attachments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access for message-attachments'
  ) THEN
    CREATE POLICY "Public Access for message-attachments"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'message-attachments');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated insert for message-attachments'
  ) THEN
    CREATE POLICY "Authenticated insert for message-attachments"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'message-attachments');
  END IF;
END $$;

-- 3. Ensure messages table has required columns for media attachments
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_storage_path TEXT;

-- 4. Index for faster attachment lookups
CREATE INDEX IF NOT EXISTS idx_messages_attachments ON public.messages USING gin (attachments) WHERE attachments IS NOT NULL AND attachments <> '[]'::jsonb;
