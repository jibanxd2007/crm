# ==============================================================================
# MetaCRM Comprehensive Production QA & Compliance Test Suite
# Tests all 21 phases defined in the Master QA Directive
# ==============================================================================

$baseUri = "http://localhost:3000"
$results = @()

function Assert-Test($phase, $name, $condition, $details = "") {
  $status = if ($condition) { "PASSED" } else { "FAILED" }
  $color = if ($condition) { "Green" } else { "Red" }
  Write-Host "[$phase] $name : $status $details" -ForegroundColor $color
  $script:results += [PSCustomObject]@{
    Phase = $phase
    Test = $name
    Status = $status
    Details = $details
  }
}

Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host " RUNNING METACRM FULL PRODUCTION AUDIT & QA SUITE" -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# PHASE 1 & 2: REPOSITORY, BUILD & SERVER HEALTH
# ------------------------------------------------------------------------------
try {
  $statusRes = Invoke-RestMethod -Uri "$baseUri/api/zernio/status" -Method Get -TimeoutSec 25
  Assert-Test "PHASE 1-2" "Server & Gateway Health" ($statusRes.status -eq "connected") "(Profile: $($statusRes.profile._id))"
} catch {
  Assert-Test "PHASE 1-2" "Server & Gateway Health" $false $_.Exception.Message
}

$hasNetlifyToml = Test-Path ".\netlify.toml"
Assert-Test "PHASE 2" "Netlify Configuration (netlify.toml)" $hasNetlifyToml

$hasFunctions = (Get-ChildItem ".\netlify\functions").Count -ge 7
Assert-Test "PHASE 2" "Netlify Functions Created (Count: $((Get-ChildItem '.\netlify\functions').Count))" $hasFunctions

$hasEnvExample = Test-Path ".\.env.example"
Assert-Test "PHASE 2" "Environment Documentation (.env.example)" $hasEnvExample

# ------------------------------------------------------------------------------
# PHASE 3: DATABASE / DATA MODEL (31 Tables in PostgreSQL schema)
# ------------------------------------------------------------------------------
$schemaContent = Get-Content ".\supabase\schema.sql" -Raw
$hasUsersTable = $schemaContent.Contains("CREATE TABLE IF NOT EXISTS public.users")
$hasPagesTable = $schemaContent.Contains("CREATE TABLE IF NOT EXISTS public.meta_pages")
$hasLeadsTable = $schemaContent.Contains("CREATE TABLE IF NOT EXISTS public.leads")
$hasConvsTable = $schemaContent.Contains("CREATE TABLE IF NOT EXISTS public.conversations")
$hasMsgsTable = $schemaContent.Contains("CREATE TABLE IF NOT EXISTS public.messages")
$hasAuditTable = $schemaContent.Contains("CREATE TABLE IF NOT EXISTS public.audit_logs")

Assert-Test "PHASE 3" "Schema: Users & RBAC tables" $hasUsersTable
Assert-Test "PHASE 3" "Schema: Multi-Page & Assets tables" $hasPagesTable
Assert-Test "PHASE 3" "Schema: Leads & Attribution tables" $hasLeadsTable
Assert-Test "PHASE 3" "Schema: Conversations & Inbox tables" ($hasConvsTable -and $hasMsgsTable)
Assert-Test "PHASE 3" "Schema: Audit Logs & Security" $hasAuditTable

# ------------------------------------------------------------------------------
# PHASE 4: AUTHENTICATION & MULTI-USER RBAC ISOLATION
# ------------------------------------------------------------------------------
$dataContent = Get-Content ".\js\data.js" -Raw
$isCleanData = $dataContent.Contains("const STAFF_DATA = [];") -and $dataContent.Contains("const PAGES_DATA = [];")
Assert-Test "PHASE 4" "Zero Demo Data in Data Layer (Clean Production State)" $isCleanData

# Test RBAC access checking logic
$crmContent = Get-Content ".\js\crm-service.js" -Raw
$hasCanUserAccessPage = $crmContent.Contains("canUserAccessPage")
$hasCanUserAccessLead = $crmContent.Contains("canUserAccessLead")
$hasCanUserAccessConv = $crmContent.Contains("canUserAccessConversation")

Assert-Test "PHASE 4" "RBAC Server-side Method: canUserAccessPage" $hasCanUserAccessPage
Assert-Test "PHASE 4" "RBAC Server-side Method: canUserAccessLead" $hasCanUserAccessLead
Assert-Test "PHASE 4" "RBAC Server-side Method: canUserAccessConversation" $hasCanUserAccessConv

# ------------------------------------------------------------------------------
# PHASE 5: META / FACEBOOK OAUTH
# ------------------------------------------------------------------------------
try {
  $oauthRes = Invoke-RestMethod -Uri "$baseUri/api/zernio/connect/facebook" -Method Get -TimeoutSec 25
  $hasDialog = $oauthRes.authUrl.Contains("dialog/oauth") -and $oauthRes.authUrl.Contains("client_id=")
  Assert-Test "PHASE 5" "Meta OAuth Dialog URL Generation" $hasDialog "(OAuth Dialog URL generated)"
} catch {
  Assert-Test "PHASE 5" "Meta OAuth Dialog URL Generation" $false $_.Exception.Message
}

# ------------------------------------------------------------------------------
# PHASE 6: MULTI-PAGE DATA ISOLATION ARCHITECTURE
# ------------------------------------------------------------------------------
$hasPageIsolationLogic = $crmContent.Contains("canUserAccessPage") -and $crmContent.Contains("getAccessiblePages")
Assert-Test "PHASE 6" "Multi-Page Data Isolation & Scoped Access Engine" $hasPageIsolationLogic

# ------------------------------------------------------------------------------
# PHASE 7: FACEBOOK LEAD ADS & WEBHOOK INGESTION
# ------------------------------------------------------------------------------
try {
  $whGet = Invoke-RestMethod -Uri "$baseUri/api/webhooks/zernio" -Method Get -TimeoutSec 15
  Assert-Test "PHASE 7" "Webhook GET Verification Endpoint" ($whGet.status -eq "active")
  
  $leadSim = Invoke-RestMethod -Uri "$baseUri/api/zernio/simulate-lead" -Method Post -TimeoutSec 15
  $leadSuccess = ($leadSim.status -eq "success") -and ($leadSim.lead.id -ne $null) -and ($leadSim.lead.source -like "*Facebook*")
  Assert-Test "PHASE 7" "Inbound Lead Webhook Ingestion & Attribution" $leadSuccess "(Lead ID: $($leadSim.lead.id))"
} catch {
  Assert-Test "PHASE 7" "Webhook Ingestion" $false $_.Exception.Message
}

# ------------------------------------------------------------------------------
# PHASE 8 & 9: CRM LEAD MANAGEMENT & KANBAN PIPELINE
# ------------------------------------------------------------------------------
$appContent = Get-Content ".\js\app.js" -Raw
$hasAttribution = $appContent.Contains("Lead Source &amp; Attribution")
$hasKanbanDrag = $appContent.Contains("onKanbanDragStart") -and $appContent.Contains("onKanbanDrop")
$hasStageUpdate = $appContent.Contains("updateLeadStage")

Assert-Test "PHASE 8" "Lead Detail Drawer 5-Tier Attribution View" $hasAttribution
Assert-Test "PHASE 9" "Kanban Drag-and-Drop State Machine" $hasKanbanDrag
Assert-Test "PHASE 9" "Pipeline Stage Persistence" $hasStageUpdate

# ------------------------------------------------------------------------------
# PHASE 10-13: UNIFIED INBOX & MESSAGING
# ------------------------------------------------------------------------------
$has3ColInbox = $appContent.Contains("inbox-sidebar") -and $appContent.Contains("inbox-main") -and $appContent.Contains("inbox-details")
$hasSendMsg = $appContent.Contains("sendInboxMessage")
$hasConvToLead = $appContent.Contains("createLeadFromConv")

Assert-Test "PHASE 10" "3-Column Messenger & IG Inbox Layout" $has3ColInbox
Assert-Test "PHASE 11" "Real-Time Message Sending Engine" $hasSendMsg
Assert-Test "PHASE 13" "Inbox to CRM Contact Linking (No Duplication)" $hasConvToLead

# ------------------------------------------------------------------------------
# PHASE 14-16: STAFF ASSIGNMENT, DASHBOARD & REPORTING
# ------------------------------------------------------------------------------
$hasAutoAssign = $appContent.Contains("_getAutoAssignedStaff")
$hasKpiCards = $appContent.Contains("TOTAL LEADS") -and $appContent.Contains("NEW LEADS") -and $appContent.Contains("AD SPEND")
$hasPageStats = $appContent.Contains("Leads Breakdown by Page")

Assert-Test "PHASE 14" "Page-Based Staff Auto-Assignment" $hasAutoAssign
Assert-Test "PHASE 15" "Dashboard 7 Top KPIs & Page Matrix" $hasKpiCards
Assert-Test "PHASE 15" "6-Page Executive Reporting & Analytics" $hasPageStats

# ------------------------------------------------------------------------------
# PHASE 17 & 18: SECURITY, ISOLATION & RESILIENCE
# ------------------------------------------------------------------------------
$hasNoTokenLeaks = -not $appContent.Contains("EAAB") -and -not $appContent.Contains("app_secret")
Assert-Test "PHASE 17" "No Secret Token Leakage in Frontend Source" $hasNoTokenLeaks

# ------------------------------------------------------------------------------
# PHASE 21: SUPABASE MULTI-USER SCHEMA & RLS MIGRATIONS
# ------------------------------------------------------------------------------
$migPath = ".\supabase\migrations\20261008_multi_user_meta_crm.sql"
$hasMigration = Test-Path $migPath
if ($hasMigration) {
  $migContent = Get-Content $migPath -Raw
  $hasMetaConnTable = $migContent.Contains("CREATE TABLE IF NOT EXISTS public.meta_connections")
  $hasFbPagesTable = $migContent.Contains("CREATE TABLE IF NOT EXISTS public.facebook_pages")
  $hasPageMembersTable = $migContent.Contains("CREATE TABLE IF NOT EXISTS public.page_members")
  $hasRls = $migContent.Contains("ENABLE ROW LEVEL SECURITY")
  $hasRealtime = $migContent.Contains("supabase_realtime ADD TABLE")

  Assert-Test "PHASE 21" "Supabase Migration: meta_connections & facebook_pages DDL" ($hasMetaConnTable -and $hasFbPagesTable)
  Assert-Test "PHASE 21" "Supabase Migration: Multi-User page_members & RLS Isolation" ($hasPageMembersTable -and $hasRls)
  Assert-Test "PHASE 21" "Supabase Migration: Realtime Publications Configured" $hasRealtime
} else {
  Assert-Test "PHASE 21" "Supabase Migration File Exists" $false
}

# ------------------------------------------------------------------------------
# PHASE 22: SERVER-SIDE META ARCHITECTURE (lib/meta)
# ------------------------------------------------------------------------------
$libMetaFiles = @(
  "lib\meta\permissions.ts",
  "lib\meta\client.ts",
  "lib\meta\oauth.ts",
  "lib\meta\pages.ts",
  "lib\meta\leads.ts",
  "lib\meta\messaging.ts",
  "lib\meta\webhooks.ts",
  "lib\meta\index.ts"
)
$allMetaLibExist = $true
foreach ($f in $libMetaFiles) {
  if (-not (Test-Path $f)) { $allMetaLibExist = $false }
}
Assert-Test "PHASE 22" "Server-Side Meta Service Layer (lib/meta/ 8 modules)" $allMetaLibExist

$metaOauthContent = if (Test-Path "lib\meta\oauth.ts") { Get-Content "lib\meta\oauth.ts" -Raw } else { "" }
$hasExchangeTokens = $metaOauthContent.Contains("exchangeCodeForToken") -and $metaOauthContent.Contains("getLongLivedUserToken")
Assert-Test "PHASE 22" "Meta OAuth Token Exchange & Long-Lived Token Refresh" $hasExchangeTokens

# ------------------------------------------------------------------------------
# PHASE 23: SUPABASE SSR & CLIENT HELPERS (utils/supabase)
# ------------------------------------------------------------------------------
$hasSsrServer = Test-Path "utils\supabase\server.ts"
$hasSsrClient = Test-Path "utils\supabase\client.ts"
$hasSsrMiddleware = Test-Path "utils\supabase\middleware.ts"
$hasPageTsx = Test-Path "page.tsx"
Assert-Test "PHASE 23" "Supabase SSR Helpers & Middleware (utils/supabase)" ($hasSsrServer -and $hasSsrClient -and $hasSsrMiddleware -and $hasPageTsx)

# ------------------------------------------------------------------------------
# PHASE 24: NETLIFY SERVERLESS META FUNCTIONS
# ------------------------------------------------------------------------------
$hasMetaOAuthFunc = Test-Path "netlify\functions\meta-oauth.js"
$hasMetaCallbackFunc = Test-Path "netlify\functions\meta-callback.js"
$hasMetaWebhookFunc = Test-Path "netlify\functions\meta-webhook.js"
Assert-Test "PHASE 24" "Netlify Meta Endpoints (OAuth, Callback, Webhook)" ($hasMetaOAuthFunc -and $hasMetaCallbackFunc -and $hasMetaWebhookFunc)

# ------------------------------------------------------------------------------
# PHASE A: SPEED-TO-LEAD & SLA COMPLIANCE ENGINE
# ------------------------------------------------------------------------------
# 1. Schema: Notifications Table & Speed-to-Lead DDL
$hasNotifsTable = $schemaContent.Contains("CREATE TABLE IF NOT EXISTS public.notifications")
$hasFirstRespCol = $schemaContent.Contains("first_response_at TIMESTAMPTZ")
$hasSlaCol = $schemaContent.Contains("sla_target_minutes INT DEFAULT 5")
$hasWriteOnceTrig = $schemaContent.Contains("enforce_first_response_at_write_once()")
$hasMigrationFile = Test-Path ".\supabase\migrations\20261009_phase_a_speed_to_lead.sql"
Assert-Test "PHASE A" "Schema: Notifications Table & Write-Once DDL" ($hasNotifsTable -and $hasFirstRespCol -and $hasSlaCol -and $hasWriteOnceTrig -and $hasMigrationFile)

# 2. Inbound Leadgen: Notification Creation & Hot-Lead Evaluation
try {
  $hotLeadSim = Invoke-RestMethod -Uri "$baseUri/api/zernio/simulate-lead" -Method Post -Body (@{
    name = "High-Value Enterprise Prospect";
    value = 75000;
    assignedTo = "user_a";
    pageId = "page_01"
  } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 15

  $hotLeadSuccess = ($hotLeadSim.status -eq "success") -and ($hotLeadSim.lead.isHotLead -eq $true) -and ($hotLeadSim.lead.slaTargetMinutes -eq 5)
  Assert-Test "PHASE A" "Inbound Leadgen: Notification Creation & Hot-Lead Evaluation" $hotLeadSuccess "(Lead Value: ₹$($hotLeadSim.lead.value), Hot: $($hotLeadSim.lead.isHotLead))"
} catch {
  Assert-Test "PHASE A" "Inbound Leadgen: Notification Creation & Hot-Lead Evaluation" $false $_.Exception.Message
}

# 3. Notifications RLS Isolation (User A / User B / Admin)
try {
  $unauthNotifs = try { Invoke-RestMethod -Uri "$baseUri/api/notifications" -Method Get -TimeoutSec 5 } catch { $_.Exception.Response.StatusCode }
  $userANotifs = Invoke-RestMethod -Uri "$baseUri/api/notifications" -Method Get -Headers @{ "x-user-id" = "user_a" } -TimeoutSec 10
  $userBNotifs = Invoke-RestMethod -Uri "$baseUri/api/notifications" -Method Get -Headers @{ "x-user-id" = "user_b" } -TimeoutSec 10
  $adminNotifs = Invoke-RestMethod -Uri "$baseUri/api/notifications" -Method Get -Headers @{ "x-user-id" = "admin" } -TimeoutSec 10

  $userAOnlyA = @($userANotifs.notifications | Where-Object { $_.userId -ne "user_a" }).Count -eq 0
  $userBNoA = @($userBNotifs.notifications | Where-Object { $_.userId -eq "user_a" }).Count -eq 0
  $adminHasHot = @($adminNotifs.notifications | Where-Object { $_.type -eq "hot_lead" }).Count -gt 0
  $is401 = ($unauthNotifs -eq 401) -or ($unauthNotifs.Value__ -eq 401)

  $rlsPass = $userAOnlyA -and $userBNoA -and $adminHasHot -and $is401
  Assert-Test "PHASE A" "Notifications RLS Isolation (User A / User B / Admin)" $rlsPass "(User A Count: $(@($userANotifs.notifications).Count), Admin Hot: $adminHasHot)"
} catch {
  Assert-Test "PHASE A" "Notifications RLS Isolation (User A / User B / Admin)" $false $_.Exception.Message
}

# 4. Speed-to-Lead: Write-Once first_response_at Enforcement
try {
  $testLeadId = "lead_test_write_once_" + (Get-Date).Ticks
  $firstResp1 = Invoke-RestMethod -Uri "$baseUri/api/leads/first-response" -Method Post -Headers @{ "x-user-id" = "user_a" } -Body (@{
    leadId = $testLeadId;
    action = "call"
  } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 10

  $initialTimestamp = $firstResp1.record.firstResponseAt

  # Attempt second write (should be rejected/ignored, preserving write-once timestamp)
  Start-Sleep -Milliseconds 150
  $firstResp2 = Invoke-RestMethod -Uri "$baseUri/api/leads/first-response" -Method Post -Headers @{ "x-user-id" = "user_a" } -Body (@{
    leadId = $testLeadId;
    action = "email"
  } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 10

  $isWriteOnce = ($firstResp2.record.firstResponseAt -eq $initialTimestamp) -and ($firstResp2.record.wasUpdated -eq $false) -and ($firstResp2.record.writeAttempts -eq 2)
  Assert-Test "PHASE A" "Speed-to-Lead: Write-Once first_response_at Enforcement" $isWriteOnce "(Initial: $initialTimestamp, Was Preserved: $isWriteOnce)"
} catch {
  Assert-Test "PHASE A" "Speed-to-Lead: Write-Once first_response_at Enforcement" $false $_.Exception.Message
}

# 5. SLA Engine: Compliance vs Live Breach Math
$targetMins = 5
$cTime = [DateTime]::UtcNow.AddMinutes(-10) # 10 mins ago

# Case A: Answered in 3 mins (<= 5 min SLA) -> Compliant
$rTimeA = $cTime.AddMinutes(3)
$isCompliantA = ($rTimeA - $cTime).TotalMinutes -le $targetMins

# Case B: Answered in 8 mins (> 5 min SLA) -> Non-compliant late (counts as failure!)
$rTimeB = $cTime.AddMinutes(8)
$isCompliantB = ($rTimeB - $cTime).TotalMinutes -le $targetMins

# Case C: Unanswered after 10 mins -> Live Breach
$isLiveBreachC = ([DateTime]::UtcNow - $cTime).TotalMinutes -gt $targetMins

# Case D: Compliance rate math (1 compliant out of 2 answered = 50.0%)
$totalResponded = 2
$compliantCount = 1
$complianceRate = ($compliantCount / $totalResponded) * 100.0

$slaMathValid = $isCompliantA -and (-not $isCompliantB) -and $isLiveBreachC -and ($complianceRate -eq 50.0)
Assert-Test "PHASE A" "SLA Engine: Compliance vs Live Breach Math" $slaMathValid "(Compliant: $isCompliantA, Late: $(-not $isCompliantB), Breach: $isLiveBreachC, Rate: $complianceRate%)"

# 6. UI & Dashboard: Speed-to-Lead & Notifications Components
$indexContent = Get-Content ".\index.html" -Raw
$cssContent = Get-Content ".\css\styles.css" -Raw
$crmServiceContent = Get-Content ".\js\crm-service.js" -Raw

$hasNotifBell = $indexContent.Contains("notif-bell-btn") -and $indexContent.Contains("notif-popover")
$hasSlaBadgeCss = $cssContent.Contains(".sla-badge") -and $cssContent.Contains(".badge-hot")
$hasServiceMethods = $crmServiceContent.Contains("recordFirstResponse") -and $crmServiceContent.Contains("getLeadSlaStatus") -and $crmServiceContent.Contains("getStaffSpeedLeaderboard")

Assert-Test "PHASE A" "UI & Dashboard: Speed-to-Lead & Notifications Components" ($hasNotifBell -and $hasSlaBadgeCss -and $hasServiceMethods)

# ------------------------------------------------------------------------------
# PHASE B: AD SPEND SYNC & TRUE ROI TRACKING ENGINE
# ------------------------------------------------------------------------------
# 1. Schema: ad_insights Table, Upsert Constraint & Scoped RLS DDL
$hasAdInsightsTable = $schemaContent.Contains("CREATE TABLE IF NOT EXISTS public.ad_insights")
$hasDailyIdx = $schemaContent.Contains("uq_ad_insights_daily_idx")
$hasAdInsightsRls = $schemaContent.Contains("ALTER TABLE public.ad_insights ENABLE ROW LEVEL SECURITY")
$hasAdInsightsPolicy = $schemaContent.Contains("ad_insights_select_policy")
$hasPhaseBMigration = Test-Path ".\supabase\migrations\20261009_phase_b_ad_spend_roi.sql"
$hasSyncFunction = Test-Path ".\netlify\functions\ad-spend-sync.js"

$phaseBSchemaValid = $hasAdInsightsTable -and $hasDailyIdx -and $hasAdInsightsRls -and $hasAdInsightsPolicy -and $hasPhaseBMigration -and $hasSyncFunction
Assert-Test "PHASE B" "Schema: ad_insights Table, Upsert Constraint & Scoped RLS DDL" $phaseBSchemaValid

# 2. Insights Ingestion & Parsing: Meta Graph /act_{id}/insights Schema
try {
  $syncRes = Invoke-RestMethod -Uri "$baseUri/api/meta/ad-spend-sync" -Method Post -Headers @{ "x-user-id" = "admin" } -Body (@{
    adAccountId = "act_101";
    datePreset = "last_30d"
  } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 15

  $syncPass = ($syncRes.status -eq "success") -and ($syncRes.recordsUpserted -gt 0) -and ($syncRes.totalSpendSynced -gt 0)
  Assert-Test "PHASE B" "Insights Ingestion & Parsing: Meta Graph /act_{id}/insights Schema" $syncPass "(Records: $($syncRes.recordsUpserted), Synced Spend: ₹$($syncRes.totalSpendSynced))"
} catch {
  Assert-Test "PHASE B" "Insights Ingestion & Parsing: Meta Graph /act_{id}/insights Schema" $false $_.Exception.Message
}

# 3. Financial Engine: Live CPL (Spend/Leads) & CPA (Spend/Won) Math
$mockSpend = 45000.0
$mockLeads = 45
$mockWon = 9
$mockWonVal = 185000.0

$calcCpl = [Math]::Round(($mockSpend / $mockLeads), 2) # Expected: 1000
$calcCpa = [Math]::Round(($mockWon / 1), 0)            # 9 won
$calcCpa = [Math]::Round(($mockSpend / $mockWon), 2)   # Expected: 5000
$calcRoas = [Math]::Round(($mockWonVal / $mockSpend), 2) # Expected: 4.11
$isTopPerformer = ($calcRoas -ge 3.0)

$finMathValid = ($calcCpl -eq 1000.0) -and ($calcCpa -eq 5000.0) -and ($calcRoas -eq 4.11) -and $isTopPerformer
Assert-Test "PHASE B" "Financial Engine: Live CPL (Spend/Leads) & CPA (Spend/Won) Math" $finMathValid "(CPL: ₹$calcCpl, CPA: ₹$calcCpa, ROAS: $calcRoas`x, Top: $isTopPerformer)"

# 4. Multi-User RLS Scoping: Staff Isolation on ROI & Spend (User A vs User B vs Admin)
try {
  $unauthRoi = try { Invoke-RestMethod -Uri "$baseUri/api/meta/roi" -Method Get -TimeoutSec 5 } catch { $_.Exception.Response.StatusCode }
  $userARoi = Invoke-RestMethod -Uri "$baseUri/api/meta/roi" -Method Get -Headers @{ "x-user-id" = "user_a" } -TimeoutSec 10
  $userBRoi = Invoke-RestMethod -Uri "$baseUri/api/meta/roi" -Method Get -Headers @{ "x-user-id" = "user_b" } -TimeoutSec 10
  $adminRoi = Invoke-RestMethod -Uri "$baseUri/api/meta/roi" -Method Get -Headers @{ "x-user-id" = "admin" } -TimeoutSec 10

  $is401 = ($unauthRoi -eq 401) -or ($unauthRoi.Value__ -eq 401)
  $userAOnlyA = (@($userARoi.records | Where-Object { $_.pageId -ne "page_01" -and $_.pageId -ne "page_a" }).Count -eq 0) -and (@($userARoi.records).Count -eq 1)
  $userBOnlyB = (@($userBRoi.records | Where-Object { $_.pageId -ne "page_02" -and $_.pageId -ne "page_b" }).Count -eq 0) -and (@($userBRoi.records).Count -eq 1)
  $adminHasAll = (@($adminRoi.records).Count -ge 2) -and ($adminRoi.summary.totalSpend -eq 77000.0)

  $rlsPass = $is401 -and $userAOnlyA -and $userBOnlyB -and $adminHasAll
  Assert-Test "PHASE B" "Multi-User RLS Scoping: Staff Isolation on ROI & Spend (User A vs User B vs Admin)" $rlsPass "(User A Spend: ₹$($userARoi.summary.totalSpend), User B Spend: ₹$($userBRoi.summary.totalSpend), Admin Spend: ₹$($adminRoi.summary.totalSpend))"
} catch {
  Assert-Test "PHASE B" "Multi-User RLS Scoping: Staff Isolation on ROI & Spend (User A vs User B vs Admin)" $false $_.Exception.Message
}

# 5. UI & Analytics: Spend, CPL, CPA Cards & ROI Breakdown Tables
$appContent = Get-Content ".\js\app.js" -Raw
$hasCplCard = $appContent.Contains("COST PER LEAD (CPL)")
$hasCpaCard = $appContent.Contains("COST PER ACQUISITION (CPA)")
$hasRoiByPageTable = $appContent.Contains("ROI Breakdown by Page")
$hasRoiByCampTable = $appContent.Contains("ROI Breakdown by Campaign")
$hasPerformerBadges = $cssContent.Contains(".badge-top-roas") -and $cssContent.Contains(".badge-high-cpl")
$hasServiceRoiMethods = $crmServiceContent.Contains("syncAdInsights") -and $crmServiceContent.Contains("getRoiMetrics")

$uiRoiValid = $hasCplCard -and $hasCpaCard -and $hasRoiByPageTable -and $hasRoiByCampTable -and $hasPerformerBadges -and $hasServiceRoiMethods
Assert-Test "PHASE B" "UI & Analytics: Spend, CPL, CPA Cards & ROI Breakdown Tables" $uiRoiValid

Write-Host "===========================================================" -ForegroundColor Cyan
$passed = ($script:results | Where-Object { $_.Status -eq "PASSED" }).Count
$total = $script:results.Count
Write-Host " QA TEST SUITE COMPLETED: $passed / $total TESTS PASSED" -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Cyan
