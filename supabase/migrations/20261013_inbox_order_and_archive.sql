-- ==============================================================================
-- INBOX CONVERSATION ORDERING, UNREAD COUNTS & ARCHIVE MIGRATION
-- Adds is_archived column, last_message_at indexing, and backfill from messages
-- ==============================================================================

-- 1. Add is_archived column to conversations table
ALTER TABLE public.conversations 
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

-- 2. Add unread_count column if not already present
ALTER TABLE public.conversations 
  ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0;

-- 3. Add indexes for high-speed recency sorting and archived filtering
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at 
  ON public.conversations (last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_is_archived 
  ON public.conversations (is_archived);

CREATE INDEX IF NOT EXISTS idx_conversations_active_recent 
  ON public.conversations (is_archived, last_message_at DESC NULLS LAST);

-- 4. Backfill last_message_at and last_message from latest messages if missing or older
UPDATE public.conversations c
SET 
  last_message_at = sub.latest_time,
  last_message = COALESCE(sub.latest_text, c.last_message),
  updated_at = NOW()
FROM (
  SELECT 
    conversation_id, 
    MAX(created_at) AS latest_time,
    (ARRAY_AGG(text ORDER BY created_at DESC))[1] AS latest_text
  FROM public.messages
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id 
  AND (c.last_message_at IS NULL OR c.last_message_at < sub.latest_time);
