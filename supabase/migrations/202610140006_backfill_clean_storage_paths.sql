-- Migration: 20261014_backfill_clean_storage_paths.sql
-- Description: Backfill messages table so that stored attachments contain clean relative storage paths rather than signed or public URLs

DO $$
BEGIN
  -- 1. Clean attachment_storage_path: strip host prefix and query tokens
  UPDATE public.messages
  SET attachment_storage_path = regexp_replace(
    regexp_replace(attachment_storage_path, '^.*?/message-attachments/', ''),
    '\?.*$', ''
  )
  WHERE attachment_storage_path IS NOT NULL 
    AND (attachment_storage_path ~ '/message-attachments/' OR attachment_storage_path ~ '\?');

  -- 2. Clean attachment_url: if it points to message-attachments, strip host prefix & query tokens to store relative path
  UPDATE public.messages
  SET 
    attachment_storage_path = COALESCE(
      attachment_storage_path,
      regexp_replace(
        regexp_replace(attachment_url, '^.*?/message-attachments/', ''),
        '\?.*$', ''
      )
    ),
    attachment_url = regexp_replace(
      regexp_replace(attachment_url, '^.*?/message-attachments/', ''),
      '\?.*$', ''
    )
  WHERE attachment_url IS NOT NULL 
    AND (attachment_url ~ '/message-attachments/' OR attachment_url ~ '^https?://.*/storage/v1/object/');

  -- 3. Clean attachments JSONB array: remove any signedUrl keys and convert url to clean relative path
  UPDATE public.messages
  SET attachments = (
    SELECT jsonb_agg(
      CASE 
        WHEN (elem->>'url') ~ '/message-attachments/' THEN
          jsonb_set(
            elem - 'signedUrl' - 'signed_url',
            '{url}',
            to_jsonb(regexp_replace(regexp_replace(elem->>'url', '^.*?/message-attachments/', ''), '\?.*$', ''))
          )
        ELSE elem - 'signedUrl' - 'signed_url'
      END
    )
    FROM jsonb_array_elements(attachments) AS elem
  )
  WHERE attachments IS NOT NULL 
    AND attachments <> '[]'::jsonb 
    AND (attachments::text ~ '/message-attachments/' OR attachments::text ~ 'signedUrl');

END $$;
