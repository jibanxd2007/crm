-- ==============================================================================
-- INBOX OPTIMIZATION MIGRATION
-- High-speed latest-first conversation sorting, message deduplication, and Realtime indexes
-- ==============================================================================

-- 1. Conversation Sorting & Filter Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at 
  ON public.conversations (last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_org_last_msg 
  ON public.conversations (organization_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_page_last_msg 
  ON public.conversations (page_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_assigned_last_msg 
  ON public.conversations (assigned_to, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_unread 
  ON public.conversations (unread_count);

CREATE INDEX IF NOT EXISTS idx_conversations_customer_psid 
  ON public.conversations (page_id, customer_psid);

-- 2. Message Thread Retrieval & Chronological Order Indexes
CREATE INDEX IF NOT EXISTS idx_messages_conv_created 
  ON public.messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_messages_created 
  ON public.messages (created_at DESC);

-- 3. Idempotent Outbound & Webhook Deduplication Columns
ALTER TABLE public.messages 
  ADD COLUMN IF NOT EXISTS client_msg_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_mid TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent' CHECK (status IN ('sending', 'sent', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_client_msg_id 
  ON public.messages (conversation_id, client_msg_id) 
  WHERE client_msg_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_meta_mid 
  ON public.messages (meta_mid) 
  WHERE meta_mid IS NOT NULL;

-- 4. Automatic Conversation Recency & Unread Counter Trigger
CREATE OR REPLACE FUNCTION public.sync_conversation_on_new_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET 
    last_message = NEW.text,
    last_message_at = NEW.created_at,
    updated_at = NOW(),
    unread_count = CASE 
      WHEN NEW.sender_type = 'customer' THEN unread_count + 1 
      ELSE unread_count 
    END
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_conversation_on_new_message ON public.messages;
CREATE TRIGGER trg_sync_conversation_on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_conversation_on_new_message();

-- 5. Realtime Publication Verification
DO $$
BEGIN
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
