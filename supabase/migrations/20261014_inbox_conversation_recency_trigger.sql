-- Migration: 20261014_inbox_conversation_recency_trigger.sql
-- Description: Ensure conversations.last_message_at is automatically updated on every message insert and indexed for sorting

DO $$
BEGIN
  -- 1. Ensure last_message_at column exists on public.conversations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'last_message_at'
  ) THEN
    ALTER TABLE public.conversations ADD COLUMN last_message_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- 2. Backfill last_message_at and last_message for any conversation where it is NULL
  UPDATE public.conversations c
  SET 
    last_message_at = sub.latest_time,
    last_message = COALESCE(sub.latest_text, c.last_message, 'Message'),
    updated_at = NOW()
  FROM (
    SELECT 
      conversation_id, 
      MAX(created_at) AS latest_time,
      (ARRAY_AGG(COALESCE(text, message_text, 'Message') ORDER BY created_at DESC))[1] AS latest_text
    FROM public.messages
    GROUP BY conversation_id
  ) sub
  WHERE c.id = sub.conversation_id 
    AND (c.last_message_at IS NULL OR c.last_message_at < sub.latest_time);

  -- Fallback for any conversations with no messages: set last_message_at to created_at or updated_at
  UPDATE public.conversations
  SET last_message_at = COALESCE(updated_at, created_at, NOW())
  WHERE last_message_at IS NULL;

  -- 3. High-speed index on last_message_at DESC NULLS LAST
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND tablename = 'conversations' AND indexname = 'idx_conversations_last_message_at_desc'
  ) THEN
    CREATE INDEX idx_conversations_last_message_at_desc 
      ON public.conversations (last_message_at DESC NULLS LAST);
  END IF;

  -- 4. Trigger Function: automatically update conversation recency on message insert
  CREATE OR REPLACE FUNCTION public.fn_sync_conversation_last_message()
  RETURNS TRIGGER AS $func$
  DECLARE
    msg_preview TEXT;
  BEGIN
    msg_preview := COALESCE(NEW.text, NEW.message_text);
    IF msg_preview IS NULL OR TRIM(msg_preview) = '' THEN
      IF NEW.attachments IS NOT NULL AND NEW.attachments <> '[]'::jsonb THEN
        msg_preview := '📎 Attachment';
      ELSIF NEW.attachment_url IS NOT NULL THEN
        msg_preview := '📎 Attachment';
      ELSE
        msg_preview := 'Message';
      END IF;
    END IF;

    UPDATE public.conversations
    SET 
      last_message = msg_preview,
      last_message_at = COALESCE(NEW.created_at, NOW()),
      is_archived = false,
      updated_at = NOW(),
      unread_count = CASE 
        WHEN NEW.direction = 'inbound' OR NEW.sender_type = 'customer' THEN unread_count + 1 
        ELSE unread_count 
      END
    WHERE id = NEW.conversation_id;

    RETURN NEW;
  END;
  $func$ LANGUAGE plpgsql;

  -- 5. Attach Trigger to public.messages
  DROP TRIGGER IF EXISTS trg_sync_conversation_last_message ON public.messages;
  CREATE TRIGGER trg_sync_conversation_last_message
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_sync_conversation_last_message();

END $$;
