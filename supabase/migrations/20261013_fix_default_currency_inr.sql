-- Migration: 20261013_fix_default_currency_inr.sql
-- Description: Update default currency for ad_accounts table to 'INR' (Indian Rupee)

ALTER TABLE IF EXISTS public.ad_accounts 
  ALTER COLUMN currency SET DEFAULT 'INR';

-- Ensure any existing nulls are set to INR without overwriting explicitly set USD/NZD/EUR rows
UPDATE public.ad_accounts 
  SET currency = 'INR' 
  WHERE currency IS NULL;
