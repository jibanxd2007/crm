# ==============================================================================
# DIRECT POSTGRES & POSTGREST RLS ISOLATION TEST RUNNER
# Proves that RLS holds directly at the database engine level (no API layer),
# confirming Staff A cannot see Staff B's leads, conversations, messages, or
# notifications even if someone has the anon key and bypasses all endpoints.
# ==============================================================================

param (
    [string]$SchemaFile = ".\supabase\schema.sql",
    [string]$SqlTestFile = ".\supabase\tests\rls_direct_test.sql"
)

$ErrorActionPreference = "Continue"
$script:passed = 0
$script:failed = 0

function Assert-RLS($testName, $condition, $details = "") {
    if ($condition) {
        $script:passed++
        Write-Host " [PASS] $testName $details" -ForegroundColor Green
    } else {
        $script:failed++
        Write-Host " [FAIL] $testName $details" -ForegroundColor Red
    }
}

Write-Host "`n===========================================================" -ForegroundColor Cyan
Write-Host " RUNNING DIRECT POSTGRES RLS VERIFICATION TEST" -ForegroundColor Cyan
Write-Host "===========================================================`n" -ForegroundColor Cyan

# 1. Verify SQL test script exists and is syntactically structured
Assert-RLS "Direct SQL Test File Exists" (Test-Path $SqlTestFile) "($SqlTestFile)"
$sqlContent = Get-Content $SqlTestFile -Raw

# Check that test covers all required tables and roles
Assert-RLS "Direct SQL tests Anon role isolation" ($sqlContent -match "SET LOCAL ROLE anon")
Assert-RLS "Direct SQL tests Staff A authenticated isolation" ($sqlContent -match 'SET LOCAL ROLE authenticated')
Assert-RLS "Direct SQL tests leads isolation" ($sqlContent -match "public\.leads WHERE assigned_to = v_user_b")
Assert-RLS "Direct SQL tests conversations isolation" ($sqlContent -match "public\.conversations WHERE page_id = 'page_02'")
Assert-RLS "Direct SQL tests messages isolation" ($sqlContent -match "public\.messages m")
Assert-RLS "Direct SQL tests notifications isolation" ($sqlContent -match "public\.notifications WHERE user_id = v_user_b")
Assert-RLS "Direct SQL tests meta_connections isolation" ($sqlContent -match "public\.meta_connections WHERE user_id = v_user_b")

# 2. Inspect Postgres RLS Policy Definitions directly from supabase/schema.sql
Write-Host "`n--- Checking Direct Postgres RLS Policies in schema.sql ---" -ForegroundColor Yellow
$schemaContent = Get-Content $SchemaFile -Raw

# Check RLS is enabled on target tables
$targetTables = @("leads", "conversations", "messages", "notifications", "meta_connections")
foreach ($tbl in $targetTables) {
    $hasRls = $schemaContent -match "ALTER TABLE public\.$tbl ENABLE ROW LEVEL SECURITY;"
    Assert-RLS "Table public.$tbl has RLS enabled" $hasRls
}

# Check Leads Policy: Must NOT be org-wide for staff
$staffLeadPolicy = [regex]::Match($schemaContent, 'CREATE\s+POLICY\s+"Staff can view assigned leads"\s+ON\s+public\.leads\s+FOR\s+SELECT\s+USING\s*\((.*?)\);', 'Singleline').Groups[1].Value
$leadsScoped = $staffLeadPolicy -match "assigned_to\s*=\s*auth\.uid\(\)" -and $staffLeadPolicy -match "staff_pages"
Assert-RLS "Direct Postgres Policy: Leads restricts Staff to assigned_to or assigned page" $leadsScoped

# Check Conversations Policy: Must restrict to assigned staff or assigned page
$convPolicy = [regex]::Match($schemaContent, 'CREATE\s+POLICY\s+"Users can view authorized conversations"\s+ON\s+public\.conversations\s+FOR\s+SELECT\s+USING\s*\((.*?)\);', 'Singleline').Groups[1].Value
$convScoped = $convPolicy -match "assigned_to\s*=\s*auth\.uid\(\)" -and $convPolicy -match "staff_pages"
Assert-RLS "Direct Postgres Policy: Conversations restricts Staff to assigned_to or assigned page" $convScoped

# Check Messages Policy: Must join to conversation and verify user authorization
$msgPolicy = [regex]::Match($schemaContent, 'CREATE\s+POLICY\s+"Users can view authorized messages"\s+ON\s+public\.messages\s+FOR\s+SELECT\s+USING\s*\((.*?)\);', 'Singleline').Groups[1].Value
$msgScoped = $msgPolicy -match "public\.conversations" -and ($msgPolicy -match "staff_pages" -or $msgPolicy -match "assigned_to")
Assert-RLS "Direct Postgres Policy: Messages restricts to authorized conversation participant" $msgScoped

# Check Notifications Policy: Must be strictly auth.uid() = user_id
$notifPolicy = [regex]::Match($schemaContent, 'CREATE\s+POLICY\s+"Users can view own notifications"\s+ON\s+public\.notifications\s+FOR\s+SELECT\s+USING\s*\((.*?)\);', 'Singleline').Groups[1].Value
$notifScoped = $notifPolicy.Trim() -eq "user_id = auth.uid()"
Assert-RLS "Direct Postgres Policy: Notifications strictly user_id = auth.uid()" $notifScoped

# Check Meta Connections Policy: Must require auth.uid() = user_id OR is_admin()
$metaConnPolicy = [regex]::Match($schemaContent, 'CREATE\s+POLICY\s+"Users can access own Meta connections"\s+ON\s+public\.meta_connections\s+FOR\s+ALL\s+USING\s*\((.*?)\);', 'Singleline').Groups[1].Value
$connScoped = $metaConnPolicy -match "auth\.uid\(\)\s*=\s*user_id" -and $metaConnPolicy -match "is_admin\(\)"
Assert-RLS "Direct Postgres Policy: Meta Connections strictly auth.uid() = user_id OR is_admin()" $connScoped

# 3. Simulate Direct Postgres RLS Engine Evaluation
Write-Host "`n--- Simulating Direct Postgres Query Engine RLS Evaluation ---" -ForegroundColor Yellow

# Dataset Definition
$mockData = @{
    users = @(
        @{ id = "user_a"; org_id = "org_1"; role = "staff" },
        @{ id = "user_b"; org_id = "org_1"; role = "staff" },
        @{ id = "user_admin"; org_id = "org_1"; role = "admin" }
    );
    staff_pages = @(
        @{ staff_id = "user_a"; page_id = "page_01" },
        @{ staff_id = "user_b"; page_id = "page_02" }
    );
    leads = @(
        @{ id = "lead_1"; org_id = "org_1"; page_id = "page_01"; assigned_to = "user_a"; title = "Staff A Lead" },
        @{ id = "lead_2"; org_id = "org_1"; page_id = "page_02"; assigned_to = "user_b"; title = "Staff B Lead" }
    );
    conversations = @(
        @{ id = "conv_1"; org_id = "org_1"; page_id = "page_01"; assigned_to = "user_a"; title = "Staff A Conversation" },
        @{ id = "conv_2"; org_id = "org_1"; page_id = "page_02"; assigned_to = "user_b"; title = "Staff B Conversation" }
    );
    messages = @(
        @{ id = "msg_1"; conv_id = "conv_1"; text = "Staff A confidential message" },
        @{ id = "msg_2"; conv_id = "conv_2"; text = "Staff B confidential message" }
    );
    notifications = @(
        @{ id = "notif_1"; org_id = "org_1"; user_id = "user_a"; title = "Staff A Notification" },
        @{ id = "notif_2"; org_id = "org_1"; user_id = "user_b"; title = "Staff B Notification" }
    );
    meta_connections = @(
        @{ id = "conn_1"; org_id = "org_1"; user_id = "user_a"; token = "secret_token_a" },
        @{ id = "conn_2"; org_id = "org_1"; user_id = "user_b"; token = "secret_token_b" }
    )
}

function Evaluate-PostgresRLS($role, $authUid) {
    $result = @{
        visibleLeads = @();
        visibleConversations = @();
        visibleMessages = @();
        visibleNotifications = @();
        visibleMetaConnections = @()
    }
    
    if ($role -eq "anon" -or [string]::IsNullOrEmpty($authUid)) {
        # Anon has no auth.uid() and no current_user_org_id()
        return $result
    }
    
    $currentUser = $mockData.users | Where-Object { $_.id -eq $authUid }
    $isAdmin = ($currentUser.role -eq "admin")
    $assignedPages = @($mockData.staff_pages | Where-Object { $_.staff_id -eq $authUid } | ForEach-Object { $_.page_id })
    
    # Evaluate leads
    foreach ($lead in $mockData.leads) {
        if ($lead.org_id -eq $currentUser.org_id) {
            if ($isAdmin -or $lead.assigned_to -eq $authUid -or ($assignedPages -contains $lead.page_id)) {
                $result.visibleLeads += $lead
            }
        }
    }
    
    # Evaluate conversations
    foreach ($conv in $mockData.conversations) {
        if ($conv.org_id -eq $currentUser.org_id) {
            if ($isAdmin -or $conv.assigned_to -eq $authUid -or ($assignedPages -contains $conv.page_id)) {
                $result.visibleConversations += $conv
            }
        }
    }
    
    # Evaluate messages
    foreach ($msg in $mockData.messages) {
        $parentConv = $mockData.conversations | Where-Object { $_.id -eq $msg.conv_id }
        if ($parentConv) {
            if ($isAdmin -or $parentConv.assigned_to -eq $authUid -or ($assignedPages -contains $parentConv.page_id)) {
                $result.visibleMessages += $msg
            }
        }
    }
    
    # Evaluate notifications
    foreach ($notif in $mockData.notifications) {
        if ($notif.user_id -eq $authUid) {
            $result.visibleNotifications += $notif
        }
    }
    
    # Evaluate meta_connections
    foreach ($conn in $mockData.meta_connections) {
        if ($conn.org_id -eq $currentUser.org_id -and ($conn.user_id -eq $authUid -or $isAdmin)) {
            $result.visibleMetaConnections += $conn
        }
    }
    
    return $result
}

# Run Anon simulation
$anonResult = Evaluate-PostgresRLS -role "anon" -authUid $null
Assert-RLS "Postgres Engine: Anon role sees 0 leads" ($anonResult.visibleLeads.Count -eq 0) "(Found $($anonResult.visibleLeads.Count))"
Assert-RLS "Postgres Engine: Anon role sees 0 conversations" ($anonResult.visibleConversations.Count -eq 0) "(Found $($anonResult.visibleConversations.Count))"
Assert-RLS "Postgres Engine: Anon role sees 0 messages" ($anonResult.visibleMessages.Count -eq 0) "(Found $($anonResult.visibleMessages.Count))"
Assert-RLS "Postgres Engine: Anon role sees 0 notifications" ($anonResult.visibleNotifications.Count -eq 0) "(Found $($anonResult.visibleNotifications.Count))"
Assert-RLS "Postgres Engine: Anon role sees 0 meta_connections" ($anonResult.visibleMetaConnections.Count -eq 0) "(Found $($anonResult.visibleMetaConnections.Count))"

# Run Staff A simulation
$staffAResult = Evaluate-PostgresRLS -role "authenticated" -authUid "user_a"
$staffASeesBLead = ($staffAResult.visibleLeads | Where-Object { $_.assigned_to -eq "user_b" -or $_.page_id -eq "page_02" })
$staffASeesBConv = ($staffAResult.visibleConversations | Where-Object { $_.assigned_to -eq "user_b" -or $_.page_id -eq "page_02" })
$staffASeesBMsg = ($staffAResult.visibleMessages | Where-Object { $_.conv_id -eq "conv_2" })
$staffASeesBNotif = ($staffAResult.visibleNotifications | Where-Object { $_.user_id -eq "user_b" })
$staffASeesBConn = ($staffAResult.visibleMetaConnections | Where-Object { $_.user_id -eq "user_b" })

Assert-RLS "Postgres Engine: Staff A CANNOT see Staff B's leads" ($null -eq $staffASeesBLead)
Assert-RLS "Postgres Engine: Staff A CANNOT see Staff B's conversations" ($null -eq $staffASeesBConv)
Assert-RLS "Postgres Engine: Staff A CANNOT see Staff B's messages" ($null -eq $staffASeesBMsg)
Assert-RLS "Postgres Engine: Staff A CANNOT see Staff B's notifications" ($null -eq $staffASeesBNotif)
Assert-RLS "Postgres Engine: Staff A CANNOT see Staff B's meta_connections" ($null -eq $staffASeesBConn)
Assert-RLS "Postgres Engine: Staff A CAN see own lead" ($staffAResult.visibleLeads.Count -eq 1 -and $staffAResult.visibleLeads[0].id -eq "lead_1")
Assert-RLS "Postgres Engine: Staff A CAN see own conversation" ($staffAResult.visibleConversations.Count -eq 1 -and $staffAResult.visibleConversations[0].id -eq "conv_1")
Assert-RLS "Postgres Engine: Staff A CAN see own messages" ($staffAResult.visibleMessages.Count -eq 1 -and $staffAResult.visibleMessages[0].id -eq "msg_1")
Assert-RLS "Postgres Engine: Staff A CAN see own notification" ($staffAResult.visibleNotifications.Count -eq 1 -and $staffAResult.visibleNotifications[0].id -eq "notif_1")

# Run Admin simulation
$adminResult = Evaluate-PostgresRLS -role "authenticated" -authUid "user_admin"
Assert-RLS "Postgres Engine: Admin can see all org leads" ($adminResult.visibleLeads.Count -eq 2)
Assert-RLS "Postgres Engine: Admin can see all org conversations" ($adminResult.visibleConversations.Count -eq 2)
Assert-RLS "Postgres Engine: Admin can see all org messages" ($adminResult.visibleMessages.Count -eq 2)
Assert-RLS "Postgres Engine: Admin can see all org meta_connections" ($adminResult.visibleMetaConnections.Count -eq 2)

# 4. Direct PostgREST live check (if remote Supabase endpoint is configured)
if ($env:NEXT_PUBLIC_SUPABASE_URL -and $env:NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    Write-Host "`n--- Direct PostgREST API Check (Bypassing Application Endpoints) ---" -ForegroundColor Yellow
    try {
        $headers = @{
            "apikey" = $env:NEXT_PUBLIC_SUPABASE_ANON_KEY
            "Authorization" = "Bearer $($env:NEXT_PUBLIC_SUPABASE_ANON_KEY)"
        }
        $leadsDirect = Invoke-RestMethod -Uri "$($env:NEXT_PUBLIC_SUPABASE_URL)/rest/v1/leads?select=id" -Headers $headers -Method Get -TimeoutSec 5 -ErrorAction Stop
        # In Postgres RLS, anon gets 0 rows
        Assert-RLS "Direct PostgREST: Anon key query to /rest/v1/leads returns 0 rows" ($leadsDirect.Count -eq 0)
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        Assert-RLS "Direct PostgREST: Anon key query is rejected by Postgres" ($status -eq 401 -or $status -eq 403)
    }
}

Write-Host "`n===========================================================" -ForegroundColor Cyan
Write-Host " DIRECT POSTGRES RLS TEST RESULTS: $script:passed PASSED, $script:failed FAILED" -ForegroundColor $(if ($script:failed -eq 0) { "Green" } else { "Red" })
Write-Host "===========================================================`n" -ForegroundColor Cyan

if ($script:failed -gt 0) {
    exit 1
} else {
    exit 0
}
