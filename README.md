# MetaCRM — Production-Ready Meta Ads, Unified Inbox & CRM Platform

A complete, production-ready Customer Relationship Management (CRM), Meta Ads Manager, Unified Messenger/Instagram DM Inbox, and Scrum/Kanban platform built for organizations managing advertising and lead generation across **6 Facebook/Instagram pages** with multiple staff members.

Designed as a focused combination of:
**HubSpot CRM** + **Meta Ads Manager** + **Linear/Trello Scrum Kanban** + **Unified Messenger Inbox**

---

## 🌟 Key Architecture & Capabilities

### 1. 6 Meta Pages Multi-Tenant Command Center
- **Page 01**: Apex Living (`page_01` - Real Estate & Luxury Living)
- **Page 02**: Elite Motors (`page_02` - Automotive & EV Dealership)
- **Page 03**: Prime Healthcare (`page_03` - Clinics & Wellness)
- **Page 04**: Urban Roasters (`page_04` - F&B & Franchising)
- **Page 05**: NovaTech SaaS (`page_05` - B2B Software & AI)
- **Page 06**: Zenith Wealth (`page_06` - Wealth Advisory & Family Office)

### 2. Hard Role-Based Access Control (RBAC)
- **Super Admin (Ananya Sen)**: Complete cross-tenant visibility across all 6 pages, all 216 contacts, 166 pipeline deals, Scrum boards, unified inbox, staff reassignment, and automation rules.
- **Staff Accounts (Rahul, Amit, Priya, Vikram, Sneha, Rohan)**: Strictly bounded by assigned page IDs. Staff cannot access unauthorized pages, deals, conversations, or system configurations. Security is enforced on both data and routing layers.

### 3. Zernio-First or Direct Meta Integration
- **Zernio Direct Mode**: Connect via Zernio API key (`metacrm_zernio_key`) or webhook endpoint (`/api/webhooks/zernio`) to bypass lengthy Meta Developer App creation, Business Verification, and App Review processes.
- **Direct Meta Mode**: Full OAuth 2.0 flow and Graph API v20.0 webhook listener (`/api/webhooks/meta`) with cryptographic HMAC SHA-256 signature verification.

### 4. HubSpot-Style Contacts CRM
- Unified customer directory across all 6 pages with lifecycle stages: `Subscriber`, `Lead`, `Marketing Qualified (MQL)`, `Sales Qualified (SQL)`, `Opportunity`, and `Customer`.
- **Slide-Over Profile Drawers**:
  - Direct 1-click communication buttons (WhatsApp, Phone Call, Email).
  - Lifecycle stage switcher with real-time database update.
  - Linked Deals section detailing active pipeline opportunities and values.
  - Full Meta Attribution trace: $\text{Lead} \rightarrow \text{Ad Creative} \rightarrow \text{Target Ad Set} \rightarrow \text{Campaign} \rightarrow \text{Page}$.
  - Chronological Activity Timeline logging notes, status changes, and communication records.

### 5. Deals & Sales Pipelines (Native Drag-and-Drop Kanban)
- **Multi-Pipeline Support**:
  - *Standard Sales Pipeline* (7 stages: New Lead, Contacted, Interested, Qualified, Follow-up, Closed Won, Closed Lost).
  - *Enterprise Deals Pipeline* (6 stages: Discovery, Demo Scheduled, Proposal Sent, Negotiation, Won, Lost).
- **Native HTML5 Drag-and-Drop**: Drag deal cards across columns with instant database persistence, stage total recalculation, stage audit trail recording (`lead_stage_history`), and automation event triggers.
- **Real-Time Forecasting**: Pipeline total value, weighted forecast value, win rate, and deal volume metrics.

### 6. Unified 3-Column Messenger & Instagram DM Inbox
- **Column 1**: Searchable conversation list with unread counters and channel badges (Facebook Messenger & Instagram Direct).
- **Column 2**: Two-way conversation feed with customer and staff bubbles, quick-reply templates, and instant message dispatch engine.
- **Column 3**: Contact CRM context card with 1-click actions: "View Lead in CRM", "Create Deal", and "Schedule Task".

### 7. Scrum Tasks & Sprints Planning Board
- **5 Agile Stages**: `Backlog`, `To Do`, `In Progress`, `Review & QC`, and `Done`.
- Drag-and-drop task progression with interactive checklist progress bars.
- Sprint planning dashboard: Sprint 01 (Active Q4 Push) and Sprint 02 (Festive Scale) with burndown progress percentages.

### 8. Automations Engine
- Pre-configured triggers & actions:
  - Instant WhatsApp welcome sequence on inbound Meta leads.
  - Page-based round-robin staff routing matrix.
  - Automated Scrum follow-up task creation on Qualified leads.
  - SLA breach alert when leads remain uncontacted after 30 minutes.
  - Outbound webhook dispatch and archival upon Closed Won deals.

### 9. Filter-Aware CSV Exporter
- Export leads and contacts filtered by Date Range, Page, Campaign, Ad Set, Ad, Staff, and Status.

---

## 💻 How to Run

### Local Zero-Dependency Server (Port 3000)
```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1 -Port 3000
```
Open your browser at:
`http://localhost:3000/`

### Test Logins (1-Click Selector in Header)
- **Super Admin**: `admin@metacrm.io` (All 6 Pages)
- **Rahul Sharma**: `rahul@metacrm.io` (Pages 01, 03)
- **Amit Patel**: `amit@metacrm.io` (Page 02)
- **Priya Nair**: `priya@metacrm.io` (Pages 04, 05)
- **Vikram Malhotra**: `vikram@metacrm.io` (Page 06)
- **Sneha Rao**: `sneha@metacrm.io` (Pages 01, 02)
- **Rohan Gupta**: `rohan@metacrm.io` (Pages 03, 05)

---

## 🗄️ Database Architecture (PostgreSQL / Supabase)
Execute [`supabase/schema.sql`](file:///C:/Users/jiban/.gemini/antigravity/scratch/meta-crm-dashboard/supabase/schema.sql) in your Supabase SQL editor:
- `organizations`, `users`, `staff_pages`
- `meta_pages`, `instagram_accounts`, `ad_accounts`, `campaigns`, `ad_sets`, `ads`, `lead_forms`
- `leads`, `contacts`, `lead_notes`, `crm_activities`, `lead_stage_history`
- `pipelines`, `pipeline_stages`, `deals`
- `conversations`, `messages`
- `sprints`, `tasks`, `task_comments`, `followups`
- `automations`, `automation_logs`, `audit_logs`
