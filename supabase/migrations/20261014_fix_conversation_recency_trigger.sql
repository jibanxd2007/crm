-- Migration: 20261014_fix_conversation_recency_trigger.sql
-- Description: Trigger recency update using GREATEST(last_message_at, NEW.created_at), inbound-only unread increment, and unique constraint on messages.meta_mid

DO $$
BEGIN
  -- 1. Deduplicate messages by meta_mid if any duplicates exist before creating unique constraint
  DELETE FROM public.messages m1
  WHERE m1.meta_mid IS NOT NULL
    AND m1.id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY meta_mid ORDER BY created_at ASC) as rnum
        FROM public.messages
        WHERE meta_mid IS NOT NULL
      ) t
      WHERE t.rnum > 1
    );

  -- 2. Drop partial index if exists and create plain UNIQUE constraint on messages.meta_mid for upsert onConflict
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_meta_mid_unique'
  ) THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_meta_mid_unique UNIQUE (meta_mid);
  END IF;

  -- 3. Replace trigger function with GREATEST() and inbound-only unread increment
  CREATE OR REPLACE FUNCTION public.fn_sync_conversation_last_message()
  RETURNS TRIGGER AS $func$
  DECLARE
    msg_preview TEXT;
    is_inbound BOOLEAN;
  BEGIN
    msg_preview := COALESCE(NEW.text, NEW.message_text);
    IF msg_preview IS NULL OR TRIM(msg_preview) = '' THEN
      IF NEW.attachments IS NOT NULL AND NEW.attachments <> '[]'::jsonb THEN
        msg_preview := '📎 Attachment';
      ELSIF NEW.attachment_url IS NOT NULL OR NEW.attachment_storage_path IS NOT NULL THEN
        msg_preview := '📎 Attachment';
      ELSE
        msg_preview := 'Message';
      END IF;
    END IF;

    is_inbound := (NEW.direction = 'inbound' OR NEW.direction = 'incoming' OR NEW.sender_type = 'customer');

    UPDATE public.conversations
    SET 
      last_message = msg_preview,
      last_message_at = GREATEST(COALESCE(last_message_at, '-infinity'::timestamptz), COALESCE(NEW.created_at, NOW())),
      is_archived = false,
      updated_at = NOW(),
      unread_count = CASE 
        WHEN is_inbound THEN COALESCE(unread_count, 0) + 1 
        ELSE COALESCE(unread_count, 0)
      END
    WHERE id = NEW.conversation_id;

    RETURN NEW;
  END;
  $func$ LANGUAGE plpgsql;

  -- 4. Re-attach trigger
  DROP TRIGGER IF EXISTS trg_sync_conversation_last_message ON public.messages;
  CREATE TRIGGER trg_sync_conversation_last_message
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_sync_conversation_last_message();

END $$;
