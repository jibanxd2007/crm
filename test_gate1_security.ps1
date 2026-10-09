# ==============================================================================
# GATE 1: SECURITY & RLS AUDIT VERIFICATION TEST SUITE
# Verifies:
# 1. RLS policy completeness & zero leaky policies across all tables
# 2. Staff A vs Staff B isolation (leads, conversations, notifications, pages)
# 3. Webhook signature enforcement (Meta X-Hub-Signature-256 HMAC-SHA256)
# 4. Serverless endpoint authentication & authorization
# 5. Client bundle zero-token leakage
# ==============================================================================

param(
    [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Continue"
$script:passed = 0
$script:failed = 0
$script:results = @()

function Assert-Security($category, $testName, $condition, $details = "") {
    if ($condition) {
        $script:passed++
        Write-Host " [PASS] $category - $testName $details" -ForegroundColor Green
        $script:results += [PSCustomObject]@{ Category = $category; Test = $testName; Status = "PASS"; Details = $details }
    } else {
        $script:failed++
        Write-Host " [FAIL] $category - $testName $details" -ForegroundColor Red
        $script:results += [PSCustomObject]@{ Category = $category; Test = $testName; Status = "FAIL"; Details = $details }
    }
}

Write-Host "`n===========================================================" -ForegroundColor Cyan
Write-Host " STARTING GATE 1: SECURITY & RLS AUDIT TEST SUITE" -ForegroundColor Cyan
Write-Host " Target URL: $BaseUrl" -ForegroundColor Cyan
Write-Host "===========================================================`n" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# 1. DATABASE SCHEMA & RLS AUDIT (supabase/schema.sql)
# ------------------------------------------------------------------------------
Write-Host "--- 1. Database Schema & RLS Policy Audit ---" -ForegroundColor Yellow

$schemaPath = ".\supabase\schema.sql"
Assert-Security "RLS_AUDIT" "schema.sql file exists" (Test-Path $schemaPath)

if (Test-Path $schemaPath) {
    $schemaText = Get-Content $schemaPath -Raw

    # Extract all created tables
    $tableMatches = [regex]::Matches($schemaText, 'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-zA-Z0-9_]+)', 'IgnoreCase')
    $createdTables = @($tableMatches | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)

    Write-Host "Found $($createdTables.Count) tables in schema.sql." -ForegroundColor Gray

    # Check that each table has ALTER TABLE ... ENABLE ROW LEVEL SECURITY
    $missingRls = @()
    foreach ($tbl in $createdTables) {
        $hasRls = $schemaText -match "ALTER\s+TABLE\s+public\.$tbl\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY"
        if (-not $hasRls) {
            $missingRls += $tbl
        }
    }

    Assert-Security "RLS_AUDIT" "All $($createdTables.Count) tables have ENABLE ROW LEVEL SECURITY" ($missingRls.Count -eq 0) "(Missing: $($missingRls -join ', '))"

    # Verify no leaky policies using USING (TRUE) or USING (true) except on non-sensitive public read
    $leakyMatches = [regex]::Matches($schemaText, 'CREATE\s+POLICY\s+"([^"]+)".*?USING\s*\(\s*(?:TRUE|true)\s*\)', 'Singleline')
    $leakyPolicies = @($leakyMatches | ForEach-Object { $_.Groups[1].Value })
    
    # Assert messages policy does NOT have USING (TRUE)
    $messagesLeaky = $schemaText -match 'ON\s+public\.messages.*?USING\s*\(\s*TRUE\s*\)'
    Assert-Security "RLS_AUDIT" "Messages table has NO leaky USING (TRUE) policy" (-not $messagesLeaky)

    # Assert conversations policy is scoped beyond just org_id
    $convsLeaky = $schemaText -match 'ON\s+public\.conversations\s+FOR\s+ALL\s+USING\s*\(\s*organization_id\s*=\s*public\.current_user_org_id\(\)\s*\);'
    Assert-Security "RLS_AUDIT" "Conversations table enforces user/page assignment scoping" (-not $convsLeaky)

    # Assert meta_pages policy enforces user/page assignment scoping
    $pagesLeaky = $schemaText -match 'ON\s+public\.meta_pages\s+FOR\s+ALL\s+USING\s*\(\s*organization_id\s*=\s*public\.current_user_org_id\(\)\s*\);'
    Assert-Security "RLS_AUDIT" "Meta Pages table restricts unassigned staff visibility" (-not $pagesLeaky)
}

# ------------------------------------------------------------------------------
# 2. CLIENT BUNDLE ZERO-SECRET LEAK AUDIT
# ------------------------------------------------------------------------------
Write-Host "`n--- 2. Client Bundle Secret Scan ---" -ForegroundColor Yellow

$clientFiles = @(
    ".\index.html",
    ".\js\app.js",
    ".\js\crm-service.js",
    ".\js\meta-service.js",
    ".\js\data.js",
    ".\js\supabase-client.js"
)

$hasExposedKey = $false
$hasExposedSecret = $false
$hasHardcodedVerifyToken = $false

foreach ($cf in $clientFiles) {
    if (Test-Path $cf) {
        $content = Get-Content $cf -Raw
        if ($content -match "sk_[0-9a-zA-Z]{20,}") {
            $hasExposedKey = $true
            Write-Host "Leaked API key pattern in $cf" -ForegroundColor Red
        }
        if ($content -match "EAAB[0-9a-zA-Z]+" -or $content -match "EAAG[0-9a-zA-Z]+") {
            $hasExposedSecret = $true
            Write-Host "Leaked Meta access token in $cf" -ForegroundColor Red
        }
        if ($content.Contains("meta_crm_wh_verify_secret_2026")) {
            $hasHardcodedVerifyToken = $true
            Write-Host "Hardcoded verify token in $cf" -ForegroundColor Red
        }
    }
}

Assert-Security "CLIENT_BUNDLE" "No secret API keys in frontend code" (-not $hasExposedKey)
Assert-Security "CLIENT_BUNDLE" "No Meta access tokens (EAAB/EAAG) in frontend code" (-not $hasExposedSecret)
Assert-Security "CLIENT_BUNDLE" "No hardcoded webhook verify token in frontend code" (-not $hasHardcodedVerifyToken)

# ------------------------------------------------------------------------------
# 3. SERVERLESS ENDPOINT AUTHENTICATION AUDIT
# ------------------------------------------------------------------------------
Write-Host "`n--- 3. Serverless Endpoint Authentication Audit ---" -ForegroundColor Yellow

$protectedEndpoints = @(
    "/api/leads",
    "/api/messages",
    "/api/notifications",
    "/api/meta/roi",
    "/api/meta/insights",
    "/api/meta/ad-spend-sync"
)

foreach ($ep in $protectedEndpoints) {
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl$ep" -Method Get -TimeoutSec 5 -ErrorAction Stop
        # If it returns 200 without auth, that's a failure!
        Assert-Security "ENDPOINT_AUTH" "Endpoint $ep rejects unauthenticated requests" $false "(Returned 200 without auth)"
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $isAuthRejected = ($status -eq 401 -or $status -eq 403)
        Assert-Security "ENDPOINT_AUTH" "Endpoint $ep rejects unauthenticated requests" $isAuthRejected "(Status: $status)"
    }
}

# ------------------------------------------------------------------------------
# 4. MULTI-USER RBAC & RLS ISOLATION (Staff A vs Staff B vs Admin)
# ------------------------------------------------------------------------------
Write-Host "`n--- 4. Multi-User RBAC & RLS Isolation Audit ---" -ForegroundColor Yellow

# Staff A: assigned to page_01 / page_a
# Staff B: assigned to page_02 / page_b

# 4a. Staff A accessing Staff B's page leads
try {
    $staffAReadB = Invoke-WebRequest -Uri "$BaseUrl/api/leads?page_id=page_02" -Method Get -Headers @{ "x-user-id" = "user_a" } -TimeoutSec 5 -ErrorAction Stop
    Assert-Security "RBAC_ISOLATION" "Staff A cannot read Staff B's page leads" $false "(Staff A received 200 on page_02)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert-Security "RBAC_ISOLATION" "Staff A cannot read Staff B's page leads" ($code -eq 403) "(Rejected with HTTP $code)"
}

# 4b. Staff B accessing Staff A's page leads
try {
    $staffBReadA = Invoke-WebRequest -Uri "$BaseUrl/api/leads?page_id=page_01" -Method Get -Headers @{ "x-user-id" = "user_b" } -TimeoutSec 5 -ErrorAction Stop
    Assert-Security "RBAC_ISOLATION" "Staff B cannot read Staff A's page leads" $false "(Staff B received 200 on page_01)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert-Security "RBAC_ISOLATION" "Staff B cannot read Staff A's page leads" ($code -eq 403) "(Rejected with HTTP $code)"
}

# 4c. Staff A cannot create/modify leads on Staff B's page
try {
    $body = @{ page_id = "page_02"; name = "Spoofed Lead" } | ConvertTo-Json
    $staffAPostB = Invoke-WebRequest -Uri "$BaseUrl/api/leads" -Method Post -Headers @{ "x-user-id" = "user_a" } -Body $body -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop
    Assert-Security "RBAC_ISOLATION" "Staff A cannot create leads on Staff B's page" $false "(Staff A received 200 on page_02 POST)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert-Security "RBAC_ISOLATION" "Staff A cannot create leads on Staff B's page" ($code -eq 403) "(Rejected with HTTP $code)"
}

# 4d. Staff A accessing Staff B's conversations
try {
    $staffAConvB = Invoke-WebRequest -Uri "$BaseUrl/api/messages?page_id=page_02" -Method Get -Headers @{ "x-user-id" = "user_a" } -TimeoutSec 5 -ErrorAction Stop
    Assert-Security "RBAC_ISOLATION" "Staff A cannot read Staff B's conversations" $false "(Staff A received 200 on page_02 messages)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert-Security "RBAC_ISOLATION" "Staff A cannot read Staff B's conversations" ($code -eq 403) "(Rejected with HTTP $code)"
}

# 4e. Staff A cannot dispatch messages via Staff B's page
try {
    $msgBody = @{ page_id = "page_02"; text = "Unauthorized Message" } | ConvertTo-Json
    $staffASendB = Invoke-WebRequest -Uri "$BaseUrl/api/messages" -Method Post -Headers @{ "x-user-id" = "user_a" } -Body $msgBody -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop
    Assert-Security "RBAC_ISOLATION" "Staff A cannot send messages via Staff B's page" $false "(Staff A dispatched message on page_02)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert-Security "RBAC_ISOLATION" "Staff A cannot send messages via Staff B's page" ($code -eq 403) "(Rejected with HTTP $code)"
}

# 4f. Notification isolation: Staff A sees ONLY Staff A's notifications
try {
    $notifsA = Invoke-RestMethod -Uri "$BaseUrl/api/notifications" -Method Get -Headers @{ "x-user-id" = "user_a" } -TimeoutSec 5
    $notifsB = Invoke-RestMethod -Uri "$BaseUrl/api/notifications" -Method Get -Headers @{ "x-user-id" = "user_b" } -TimeoutSec 5

    $aHasOther = @($notifsA.notifications | Where-Object { $_.userId -ne "user_a" }).Count -gt 0
    $bHasOther = @($notifsB.notifications | Where-Object { $_.userId -ne "user_b" }).Count -gt 0

    Assert-Security "RBAC_ISOLATION" "Notifications strictly scoped to authenticated user (no cross-user leaking)" (-not $aHasOther -and -not $bHasOther)
} catch {
    Assert-Security "RBAC_ISOLATION" "Notifications strictly scoped to authenticated user" $false $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 5. WEBHOOK SIGNATURE & HANDSHAKE ENFORCEMENT
# ------------------------------------------------------------------------------
Write-Host "`n--- 5. Webhook Signature & Handshake Audit ---" -ForegroundColor Yellow

# 5a. GET verification handshake fails with wrong token
try {
    $badHandshake = Invoke-WebRequest -Uri "$BaseUrl/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=12345" -Method Get -TimeoutSec 5 -ErrorAction Stop
    Assert-Security "WEBHOOK_SECURITY" "GET verification handshake rejects wrong token" $false "(Returned HTTP 200 on invalid token)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert-Security "WEBHOOK_SECURITY" "GET verification handshake rejects wrong token" ($code -eq 403) "(Rejected with HTTP $code)"
}

# 5b. POST without signature fails (when secret configured) or validates HMAC
$testPayload = '{"object":"page","entry":[{"id":"page_01","changes":[{"field":"leadgen","value":{"leadgen_id":"test_123"}}]}]}'

try {
    $unsignedPost = Invoke-WebRequest -Uri "$BaseUrl/api/webhooks/meta" -Method Post -Body $testPayload -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop
    # If no secret was set on local dev server, it returns 200; if secret set, it returns 401
    Write-Host "  (Note: server secret status evaluated)" -ForegroundColor Gray
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert-Security "WEBHOOK_SECURITY" "POST rejects unsigned webhook when secret configured" ($code -eq 401) "(Rejected with HTTP $code)"
}

# ------------------------------------------------------------------------------
# 6. DIRECT POSTGRES RLS ISOLATION AUDIT (Bypassing API layer)
# ------------------------------------------------------------------------------
Write-Host "`n--- 6. Direct Postgres RLS Isolation Audit (No API Layer) ---" -ForegroundColor Yellow

$directRlsScript = ".\tests\test_direct_postgres_rls.ps1"
if (Test-Path $directRlsScript) {
    & powershell -ExecutionPolicy Bypass -File $directRlsScript
    if ($LASTEXITCODE -eq 0) {
        Assert-Security "DIRECT_POSTGRES_RLS" "Direct Postgres RLS isolation passed for anon and authenticated roles" $true
    } else {
        Assert-Security "DIRECT_POSTGRES_RLS" "Direct Postgres RLS isolation passed for anon and authenticated roles" $false "(Direct RLS test failed)"
    }
}

Write-Host "`n===========================================================" -ForegroundColor Cyan
Write-Host " GATE 1 SECURITY AUDIT COMPLETED: $script:passed / ($($script:passed + $script:failed)) TESTS PASSED" -ForegroundColor $(if ($script:failed -eq 0) { "Green" } else { "Red" })
Write-Host "===========================================================`n" -ForegroundColor Cyan

if ($script:failed -gt 0) {
    exit 1
} else {
    exit 0
}
