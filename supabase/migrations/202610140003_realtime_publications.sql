-- Migration: 20261014_realtime_publications.sql
-- Description: Ensure public.leads, public.messages, and public.conversations are added to supabase_realtime publication for fresh Supabase setups

DO $$
BEGIN
  -- 1. Ensure supabase_realtime publication exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- 2. Add public.leads to supabase_realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;

  -- 3. Add public.messages to supabase_realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  -- 4. Add public.conversations to supabase_realtime publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;

  -- 5. Set REPLICA IDENTITY FULL so Realtime receives full row data on UPDATE/DELETE
  ALTER TABLE public.leads REPLICA IDENTITY FULL;
  ALTER TABLE public.messages REPLICA IDENTITY FULL;
  ALTER TABLE public.conversations REPLICA IDENTITY FULL;
END $$;
