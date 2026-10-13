-- Migration: 20261013_multi_currency_support.sql
-- Description: Multi-currency support and default base currency alignment for ad_accounts

ALTER TABLE IF EXISTS public.ad_accounts 
  ALTER COLUMN currency SET DEFAULT 'INR';

-- Ensure any existing nulls are set to INR without overwriting explicitly set USD/NZD/EUR rows
UPDATE public.ad_accounts 
  SET currency = 'INR' 
  WHERE currency IS NULL;
