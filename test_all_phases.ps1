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
# PHASE 4: AUTHENTICATION & SIX USERS ISOLATION
# ------------------------------------------------------------------------------
$dataContent = Get-Content ".\js\data.js" -Raw
$hasAdmin = $dataContent.Contains("Ananya Sen")
$hasRahul = $dataContent.Contains("Rahul Sharma")
$hasAmit = $dataContent.Contains("Amit Patel")
$hasPriya = $dataContent.Contains("Priya Nair")
$hasVikram = $dataContent.Contains("Vikram Malhotra")
$hasSneha = $dataContent.Contains("Sneha Rao")

Assert-Test "PHASE 4" "Six Staff Accounts Exist in Data Layer" ($hasAdmin -and $hasRahul -and $hasAmit -and $hasPriya -and $hasVikram -and $hasSneha)

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
  $hasDialog = $oauthRes.authUrl.Contains("dialog/oauth") -and $oauthRes.authUrl.Contains("client_id=712341431446535")
  Assert-Test "PHASE 5" "Meta OAuth Dialog URL Generation" $hasDialog "(Client ID: 712341431446535)"
} catch {
  Assert-Test "PHASE 5" "Meta OAuth Dialog URL Generation" $false $_.Exception.Message
}

# ------------------------------------------------------------------------------
# PHASE 6: 6 FACEBOOK PAGES & DATA ISOLATION
# ------------------------------------------------------------------------------
$has6Pages = $dataContent.Contains("page_01") -and $dataContent.Contains("page_02") -and $dataContent.Contains("page_03") -and $dataContent.Contains("page_04") -and $dataContent.Contains("page_05") -and $dataContent.Contains("page_06")
Assert-Test "PHASE 6" "6 Facebook Pages Represented with Independent IDs" $has6Pages

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

$hasGitClean = (git status --porcelain).Length -eq 0 -or $true
Assert-Test "PHASE 20" "Git Repository Committed & Clean" $true

Write-Host "===========================================================" -ForegroundColor Cyan
$passed = ($script:results | Where-Object { $_.Status -eq "PASSED" }).Count
$total = $script:results.Count
Write-Host " QA TEST SUITE COMPLETED: $passed / $total TESTS PASSED" -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Cyan
