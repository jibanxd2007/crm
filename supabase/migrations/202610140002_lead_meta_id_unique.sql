-- Migration: 20261014_lead_meta_id_unique.sql
-- Description: Clean duplicates on leads.meta_lead_id, re-point foreign key dependencies to the oldest row, and add plain UNIQUE constraint

DO $$
DECLARE
  rec RECORD;
  kept_id TEXT;
  deleted_count INT := 0;
BEGIN
  -- 1. Deduplication loop: Find all meta_lead_id values with more than 1 row
  FOR rec IN (
    SELECT meta_lead_id
    FROM public.leads
    WHERE meta_lead_id IS NOT NULL AND meta_lead_id <> ''
    GROUP BY meta_lead_id
    HAVING COUNT(*) > 1
  ) LOOP
    -- Pick the oldest row (earliest created_at, tie-break on id)
    SELECT id::text INTO kept_id
    FROM public.leads
    WHERE meta_lead_id = rec.meta_lead_id
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    -- Re-point foreign keys across all dependent tables before deletion
    -- A. lead_notes (lead_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_notes') THEN
      UPDATE public.lead_notes
      SET lead_id = kept_id
      WHERE lead_id IN (SELECT id::text FROM public.leads WHERE meta_lead_id = rec.meta_lead_id AND id::text <> kept_id);
    END IF;

    -- B. crm_activities (lead_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_activities') THEN
      UPDATE public.crm_activities
      SET lead_id = kept_id
      WHERE lead_id IN (SELECT id::text FROM public.leads WHERE meta_lead_id = rec.meta_lead_id AND id::text <> kept_id);
    END IF;

    -- C. notifications (lead_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
      BEGIN
        EXECUTE 'UPDATE public.notifications SET lead_id = $1 WHERE lead_id::text IN (SELECT id::text FROM public.leads WHERE meta_lead_id = $2 AND id::text <> $1::text)'
        USING kept_id, rec.meta_lead_id;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- D. deals (lead_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'deals') THEN
      BEGIN
        EXECUTE 'UPDATE public.deals SET lead_id = $1 WHERE lead_id::text IN (SELECT id::text FROM public.leads WHERE meta_lead_id = $2 AND id::text <> $1::text)'
        USING kept_id, rec.meta_lead_id;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- E. lead_stage_history (lead_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_stage_history') THEN
      BEGIN
        EXECUTE 'UPDATE public.lead_stage_history SET lead_id = $1 WHERE lead_id::text IN (SELECT id::text FROM public.leads WHERE meta_lead_id = $2 AND id::text <> $1::text)'
        USING kept_id, rec.meta_lead_id;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- F. tasks (related_lead_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks') THEN
      BEGIN
        EXECUTE 'UPDATE public.tasks SET related_lead_id = $1 WHERE related_lead_id::text IN (SELECT id::text FROM public.leads WHERE meta_lead_id = $2 AND id::text <> $1::text)'
        USING kept_id, rec.meta_lead_id;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- G. followups (lead_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'followups') THEN
      BEGIN
        EXECUTE 'UPDATE public.followups SET lead_id = $1 WHERE lead_id::text IN (SELECT id::text FROM public.leads WHERE meta_lead_id = $2 AND id::text <> $1::text)'
        USING kept_id, rec.meta_lead_id;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- H. email_messages (lead_id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_messages') THEN
      UPDATE public.email_messages
      SET lead_id = kept_id
      WHERE lead_id IN (SELECT id::text FROM public.leads WHERE meta_lead_id = rec.meta_lead_id AND id::text <> kept_id);
    END IF;

    -- Delete the duplicate leads, leaving only the oldest kept row
    DELETE FROM public.leads
    WHERE meta_lead_id = rec.meta_lead_id AND id::text <> kept_id;
    deleted_count := deleted_count + 1;
  END LOOP;

  RAISE NOTICE 'Dedup completed. Groups cleaned: %', deleted_count;

  -- 2. Drop partial unique indexes if any exist so they do not conflict
  DROP INDEX IF EXISTS public.idx_leads_meta_lead_id;
  DROP INDEX IF EXISTS public.uq_leads_meta_lead_id;

  -- 3. Add plain (non-partial) UNIQUE constraint on leads.meta_lead_id
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.leads'::regclass 
      AND contype = 'u' 
      AND conname = 'leads_meta_lead_id_key'
  ) THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_meta_lead_id_key UNIQUE (meta_lead_id);
  END IF;
END $$;
