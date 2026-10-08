# MetaCRM — Production-Ready Meta Ads, Unified Inbox & CRM Platform

A complete, production-ready Customer Relationship Management (CRM), Meta Ads Manager, Unified Messenger/Instagram DM Inbox, and Kanban platform built for organizations managing advertising and lead generation across multiple Facebook/Instagram pages with staff members.

Designed as a focused combination of:
**HubSpot CRM** + **Meta Ads Manager** + **Kanban Pipeline** + **Unified Messenger Inbox**

---

## 🌟 Key Architecture & Capabilities

### 1. Multi-Page Meta Command Center
- Connect Facebook and Instagram business pages via official Meta Graph API v24.0 OAuth or Zernio verified gateway.
- Automated real-time synchronization of Leads, Instant Forms, Ad sets, and Ad creatives.
- Multi-page performance comparison, lead volume breakdown, and ROI tracking.

### 2. Hard Role-Based Access Control (RBAC)
- **Administrator**: Complete organization-wide visibility across all connected pages, staff members, pipeline stages, unified inbox, and settings.
- **Staff Accounts**: Strictly bounded by assigned page IDs. Staff cannot access unauthorized pages, leads, or conversations. Security is enforced at data, API, and database (PostgreSQL Row Level Security) levels.

### 3. Real Meta API & Webhook Ingestion
- Official Meta Graph API v24.0 OAuth 2.0 flow (`/api/meta/oauth` and `/api/meta/callback`).
- Live webhook listeners for real-time lead capture (`leadgen`) and bidirectional Messenger / Instagram Direct messaging (`messages`).
- Server-side token exchange and secure token storage in Supabase PostgreSQL (zero secret leaks in frontend).

### 4. Contacts & Lead Management
- Unified customer directory with lifecycle stages: `New Lead`, `Contacted`, `Qualified`, `Follow-up`, `Won`, and `Lost`.
- **Slide-Over Profile Drawers**:
  - Direct 1-click communication buttons (WhatsApp, Phone Call, Email).
  - Lifecycle stage switcher with real-time database update.
  - Full Meta Attribution trace: $\text{Lead} \rightarrow \text{Ad Creative} \rightarrow \text{Target Ad Set} \rightarrow \text{Campaign} \rightarrow \text{Page}$.
  - Chronological Activity Timeline logging notes, status changes, and communication records.

### 5. Deals & Sales Pipelines (Native Drag-and-Drop Kanban)
- **Multi-Pipeline Support**: Standard Sales Pipeline and Enterprise Deals Pipeline.
- **Native HTML5 Drag-and-Drop**: Drag cards across stages with instant persistence, stage total recalculation, and activity history.
- Pipeline stage distribution and conversion rate analytics.

### 6. Unified 3-Column Messenger & Instagram DM Inbox
- **Column 1**: Searchable conversation list with unread counters and channel filters (Facebook Messenger & Instagram Direct).
- **Column 2**: Two-way conversation feed with customer and staff message bubbles, and real-time message sending.
- **Column 3**: Contact CRM context card with 1-click actions: "Open Full Profile", "Mark as Qualified", and "Create Lead in CRM".

### 7. Tasks & Follow-up Scheduler
- Task progression tracking: All, Today, Upcoming, and Overdue.
- Scheduled follow-ups linked to specific leads and assigned staff members.

### 8. Analytics & Reporting
- Executive dashboard tracking Total Leads, Qualified Leads, Converted Deals, and Cost Per Lead.
- Page breakdown comparison and staff performance reports.
- Filter-aware CSV exporter.

---

## 💻 How to Run

### Production Deployment
Live on Netlify at:
`https://serene-toffee-fe3244.netlify.app`

### Local Development
```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1 -Port 3000
```
Open your browser at:
`http://localhost:3000/`

---

## 🗄️ Database Architecture (PostgreSQL / Supabase)
Schema files:
- `supabase/schema.sql`: Base relational tables and constraints.
- `supabase/migrations/20261008_multi_user_meta_crm.sql`: Multi-tenant user isolation, `meta_connections`, `facebook_pages`, `page_members`, and Row Level Security policies.
