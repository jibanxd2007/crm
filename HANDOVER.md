# MetaCRM Client Handover Brief & Deployment Guide

Welcome to **MetaCRM** — an enterprise lead management and multi-channel messaging platform built with Vanilla JS, Supabase (PostgreSQL, Row Level Security, Storage, Realtime), and Vercel Serverless Functions.

---

## 1. Architecture Overview

- **Frontend:** Single Page Application (`index.html`, `js/app.js`, `js/crm-service.js`, `js/meta-service.js`, `js/supabase-client.js`).
- **Serverless API:** Exactly 11 unified endpoints in `api/*.js`, delegating helper logic to `api/_utils/`, `api/_email/`, and `api/_meta/`.
- **Database & Storage:** Supabase PostgreSQL with strict Row Level Security (RLS), Supabase Storage bucket `message-attachments`, and Supabase Realtime WebSocket streams.

---

## 2. Serverless API Architecture (11 Top-Level Endpoints)

The API functions are maintained within Vercel's Hobby execution limit (11 top-level functions):

1. `api/config.js` — Public application configuration, Supabase anon keys, Resend status, and FX rate tables.
2. `api/email.js` — Unified email gateway routing OAuth and transactional dispatch.
3. `api/integrations.js` — Third-party connected services registry (Meta, Google, Microsoft, Resend).
4. `api/leads.js` — Leads CRUD, timeline notes, stage progression, and assignment.
5. `api/messages.js` — Direct storage signed upload URLs (`action=upload-url`), thread retrieval, and Meta Graph / Zernio outbound messaging.
6. `api/meta.js` — Meta Marketing & Lead Ads webhook, OAuth callback, campaign metric synchronization.
7. `api/notifications.js` — Realtime team alerts, speed-to-lead SLA notifications.
8. `api/pages.js` — Facebook / Instagram Page membership and permission gates.
9. `api/reports.js` — Multi-tier marketing ROI, ad spend analytics, conversion attribution.
10. `api/staff.js` — User RBAC directory, role management, and access scoping.
11. `api/zernio.js` — Zernio gateway, lead webhooks, and idempotent backfill synchronization (`path=sync-leads`).

Internal helpers are located under `api/_utils/`, `api/_email/`, and `api/_meta/`.

---

## 3. Database Migrations (Run in Order)

Execute the following migration scripts in order via the **Supabase SQL Editor**:

1. `supabase/migrations/20261008_multi_user_meta_crm.sql` — Initial RBAC schema, multi-page scoping, core tables.
2. `supabase/migrations/20261009_phase_a_speed_to_lead.sql` — Speed-to-lead notifications, first response tracking, SLA compliance.
3. `supabase/migrations/20261009_phase_b_ad_spend_roi.sql` — Ad insights, campaign spend tracking, marketing ROI calculations.
4. `supabase/migrations/20261012_meta_ads_email_integrations.sql` — Email accounts, OAuth state management, email thread schema.
5. `supabase/migrations/20261012_optimize_inbox_messaging.sql` — Inbox indices, client idempotency keys, delivery statuses.
6. `supabase/migrations/20261013_inbox_order_and_archive.sql` — Recency ordering, archive status scoping.
7. `supabase/migrations/20261013_message_attachments_storage.sql` — Message attachments table schema and bucket definition.
8. `supabase/migrations/20261013_multi_currency_support.sql` — Multi-currency support and default base currency alignment for ad accounts.
9. `supabase/migrations/20261014_storage_signed_uploads_limit.sql` — Bucket 25MB file limit, MIME allowlist, and signed upload RLS policies.
10. `supabase/migrations/20261014_lead_meta_id_unique.sql` — Database-level lead deduplication, foreign key reparenting, and UNIQUE constraint on `meta_lead_id`.
11. `supabase/migrations/20261014_realtime_publications.sql` — Realtime publication registration for `leads`, `messages`, and `conversations`.
12. `supabase/migrations/20261014_inbox_conversation_recency_trigger.sql` — Automated conversation recency trigger on `messages` insert and index on `last_message_at DESC`.
13. `supabase/migrations/20261014_fix_conversation_recency_trigger.sql` — Trigger refinement with `GREATEST()` timestamp recency, inbound-only unread increment, and `meta_mid` UNIQUE constraint.
14. `supabase/migrations/20261014_backfill_clean_storage_paths.sql` — Backfill converting stored signed or public URLs in `messages` to relative storage paths.

---

## 4. Environment Variables Checklist (Vercel)

Configure the following variables in **Vercel Project Settings → Environment Variables**:

| Variable | Purpose | Requirement |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL | Required |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anonymous API key for frontend | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase privileged service role key | Required |
| `RESEND_API_KEY` | Resend transactional email API key | Configured |
| `RESEND_FROM_EMAIL` | Outbound sender address (e.g. `notifications@yourverifieddomain.com`) | Required before go-live (verified domain) |
| `FX_RATES_JSON` | Currency exchange rates table from base INR (e.g. `{"base":"INR","USD":0.012,"NZD":0.020,"updated":"2026-10-14"}`) | Optional (has sane built-in fallback) |
| `ZERNIO_API_KEY` | Zernio gateway token for multi-channel intake | Configured |
| `META_APP_SECRET` | Meta app secret for webhook signature validation | Configured |
| `META_SYSTEM_USER_ACCESS_TOKEN` | System user token for Meta Graph API marketing sync | Configured |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Workspace OAuth for Gmail | Optional |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Microsoft 365 OAuth for Outlook | Optional |

> **Important Hosting Plan Note:**  
> The Vercel Hobby plan is strictly for non-commercial personal projects and imposes a hard 12-function deployment limit. For commercial client production deployments, upgrade to **Vercel Pro**, which removes the function limit, increases body limits, and offers production SLAs.

---

## 5. Key System Features & Operational Guidelines

### A. Large Media & Document Attachments (Bypassing 4.5MB Limits)
- All client attachments upload directly from the browser to Supabase Storage using pre-signed upload URLs generated by `POST api/messages.js?action=upload-url`.
- No media file bytes traverse Vercel serverless functions, completely bypassing Vercel's 4.5MB request body cap.
- Maximum attachment size is 25MB (26,214,400 bytes). Supported formats include images, MP4/QuickTime videos, audio recordings, PDFs, and common office documents.

### B. Multi-Currency Conversion
- Stored amounts (ad spend, deal values, and revenue) use **INR** as the single canonical base currency, reflecting connected Meta ad accounts and CRM records.
- The topbar currency selector converts amounts dynamically between USD ($), INR (₹), and NZD ($) based on the FX table served by `api/config.js`.
- The dropdown displays the active exchange rate and rate update timestamp on hover. Default display currency is **USD**.

### C. Live Lead Deduplication
- Database-level deduplication is strictly enforced by a plain `UNIQUE (meta_lead_id)` constraint on `public.leads`.
- All lead ingestion paths (`api/zernio.js` webhooks, Meta webhooks in `api/_meta/webhook.js`, and manual backfill syncs) use `.upsert(..., { onConflict: 'meta_lead_id', ignoreDuplicates: true })`.
- Repeated syncs or concurrent webhook deliveries safely skip existing leads without errors or duplicates.

### D. Supabase Realtime & RLS Visibility
- Tables `public.leads`, `public.messages`, and `public.conversations` publish changes to the `supabase_realtime` channel.
- Realtime events are filtered by PostgreSQL RLS:
  - Administrators see all organizational activity.
  - Staff members see leads and conversations assigned to them or to their designated Facebook pages.
  - The dashboard header displays timestamps in **browser-local time**.

---

## 6. Client Verification & Acceptance Checklist

Before production go-live, complete the following verification steps:

- [ ] **Large Attachment Test:** Open an active conversation in Inbox, upload a video or document larger than 5MB (e.g. 15–20MB), verify upload completes with progress indicator, and confirm the attachment renders and plays in the conversation thread.
- [ ] **Rejection Test:** Attempt to upload a file over 25MB; confirm a clear warning message displays and the upload is rejected.
- [ ] **Lead Dedup Test:** In Leads, click **"Sync Zernio Leads"** twice. Confirm the first run reports new leads, and the second run reports `0 new, X skipped`.
- [ ] **Currency Conversion Test:** Switch the topbar currency dropdown between USD, INR, and NZD. Confirm that numbers across the Dashboard, Deals, and Reports convert according to the exchange rate rather than simply replacing the symbol.
- [ ] **Resend Integration Warning:** In **Integrations**, verify that if `RESEND_FROM_EMAIL` is unset or `onboarding@resend.dev`, the Resend card displays the unverified sender warning banner.
- [ ] **Realtime Ingestion:** Insert a test lead via the Supabase SQL Editor and confirm the open dashboard updates live without requiring a manual page refresh.
