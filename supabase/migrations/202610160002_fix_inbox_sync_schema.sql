-- ==============================================================================
-- ZERNIO MULTI-CHANNEL INBOX & MESSAGING COMPATIBILITY & PERSISTENCE
-- Migration: 202610160002_fix_inbox_sync_schema.sql
-- ==============================================================================

DO $$
BEGIN
  -- 1. Ensure all columns exist on public.conversations for provider mapping & backward compatibility
  ALTER TABLE public.conversations 
    ADD COLUMN IF NOT EXISTS external_id TEXT,
    ADD COLUMN IF NOT EXISTS account_id TEXT,
    ADD COLUMN IF NOT EXISTS platform TEXT,
    ADD COLUMN IF NOT EXISTS channel TEXT,
    ADD COLUMN IF NOT EXISTS customer_name TEXT,
    ADD COLUMN IF NOT EXISTS customer_psid TEXT,
    ADD COLUMN IF NOT EXISTS participant_id TEXT,
    ADD COLUMN IF NOT EXISTS participant_name TEXT,
    ADD COLUMN IF NOT EXISTS participant_profile_picture TEXT,
    ADD COLUMN IF NOT EXISTS raw_data JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0;

  -- 2. Relax NOT NULL constraints on legacy columns to support third-party multi-channel ingestion
  ALTER TABLE public.conversations ALTER COLUMN page_id DROP NOT NULL;
  ALTER TABLE public.conversations ALTER COLUMN participant_id DROP NOT NULL;
  ALTER TABLE public.conversations ALTER COLUMN participant_name DROP NOT NULL;

  -- 3. Relax channel constraint to support 'facebook', 'messenger', 'instagram', 'whatsapp'
  ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
  ALTER TABLE public.conversations ADD CONSTRAINT conversations_channel_check 
    CHECK (channel IS NULL OR channel IN ('messenger', 'instagram', 'whatsapp', 'facebook'));

  -- 4. Ensure all columns exist on public.messages for provider mapping & rich attachments
  ALTER TABLE public.messages 
    ADD COLUMN IF NOT EXISTS account_id TEXT,
    ADD COLUMN IF NOT EXISTS external_id TEXT,
    ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'inbound',
    ADD COLUMN IF NOT EXISTS raw_data JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS client_msg_id TEXT,
    ADD COLUMN IF NOT EXISTS meta_mid TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent',
    ADD COLUMN IF NOT EXISTS text TEXT,
    ADD COLUMN IF NOT EXISTS message_text TEXT,
    ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS attachment_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS attachment_url TEXT;

  -- 5. Relax NOT NULL constraint on messages.page_id to support external direct messaging
  ALTER TABLE public.messages ALTER COLUMN page_id DROP NOT NULL;

  -- 6. Create high-speed lookup indexes
  CREATE INDEX IF NOT EXISTS idx_conversations_external_id ON public.conversations (external_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_account_id ON public.conversations (account_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_last_msg_at ON public.conversations (last_message_at DESC NULLS LAST);
  CREATE INDEX IF NOT EXISTS idx_messages_external_id ON public.messages (external_id);
  CREATE INDEX IF NOT EXISTS idx_messages_meta_mid ON public.messages (meta_mid);
  CREATE INDEX IF NOT EXISTS idx_messages_client_msg_id ON public.messages (client_msg_id);
  CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON public.messages (conversation_id, created_at ASC);

  -- 7. Ensure meta_mid unique constraint on messages for idempotent webhook deduplication
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_meta_mid_unique'
  ) THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_meta_mid_unique UNIQUE (meta_mid);
  END IF;

  -- 8. Trigger: Automatically update conversation last_message, recency, and unread increment
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
    WHERE id = NEW.conversation_id 
       OR (external_id IS NOT NULL AND external_id = NEW.conversation_id::text);

    RETURN NEW;
  END;
  $func$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trg_sync_conversation_last_message ON public.messages;
  CREATE TRIGGER trg_sync_conversation_last_message
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_sync_conversation_last_message();

  -- 9. Ensure publication for Supabase Realtime
  ALTER TABLE public.conversations REPLICA IDENTITY FULL;
  ALTER TABLE public.messages REPLICA IDENTITY FULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

END $$;
