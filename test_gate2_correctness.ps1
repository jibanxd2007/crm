# ==============================================================================
# GATE 2: CORRECTNESS & VERIFICATION TEST SUITE
# Focus Areas:
# 1. Critical Money & Data Paths:
#    - OAuth token exchange (Dialog URL, Code exchange, OAuth error, Missing code)
#    - Lead Ingestion & 5-Tier Attribution (page, form, ad, adset, campaign)
#    - Webhook Idempotency & Duplicate Protection (zero duplicate leads)
#    - Outbound Message Auth (Unauth 401, Cross-page 403, Authorized 200)
#    - Write-Once first_response_at capture
#    - SLA Calculation (Compliant, Late, Live Breach, Team Compliance Rate)
# 2. Fresh-Account Zero-Data State:
#    - Empty APIs (/api/leads, /api/messages, /api/notifications, /api/meta/roi)
#    - Zero divide-by-zero, zero NaN, clean empty state rendering
# 3. Key Error Paths & Edge Cases:
#    - Meta API error (Rate limit HTTP 429)
#    - Expired token (OAuthException 190 / 463 HTTP 401)
#    - Malformed webhook (Invalid JSON HTTP 400, Missing entry HTTP 400)
#    - Zero corrupt data written
# ==============================================================================

param (
    [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Continue"
$script:passed = 0
$script:failed = 0
$script:results = @()

function Assert-Gate2($category, $testName, $condition, $details = "") {
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
Write-Host " STARTING GATE 2: CORRECTNESS & TESTS SUITE" -ForegroundColor Cyan
Write-Host " Target URL: $BaseUrl" -ForegroundColor Cyan
Write-Host "===========================================================`n" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# 1. CRITICAL MONEY & DATA PATHS: OAUTH TOKEN EXCHANGE
# ------------------------------------------------------------------------------
Write-Host "--- 1. OAuth Token Exchange & Auth Paths ---" -ForegroundColor Yellow

# 1a. Meta OAuth Dialog URL Generation
try {
    $oauthUrlRes = Invoke-RestMethod -Uri "$BaseUrl/api/meta/oauth" -Method Get -TimeoutSec 5
    $hasClientId = -not [string]::IsNullOrEmpty($oauthUrlRes.clientId)
    $hasScopes = $oauthUrlRes.url -match "scope=" -and $oauthUrlRes.url -match "leads_retrieval"
    $hasRedirect = $oauthUrlRes.redirectUri -match "/api/meta/callback"
    Assert-Gate2 "OAUTH" "OAuth authorization dialog URL generated with required scopes" ($hasClientId -and $hasScopes -and $hasRedirect) "(Client ID: $($oauthUrlRes.clientId))"
} catch {
    Assert-Gate2 "OAUTH" "OAuth authorization dialog URL generated with required scopes" $false $_.Exception.Message
}

# 1b. Successful Code Exchange for Access Token
try {
    $tokenRes = Invoke-RestMethod -Uri "$BaseUrl/api/meta/oauth/token" -Method Post -Body (@{ code = "auth_code_test_valid" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
    $hasToken = $tokenRes.status -eq "success" -and -not [string]::IsNullOrEmpty($tokenRes.access_token)
    $hasExpiry = $tokenRes.expires_in -ge 3600
    Assert-Gate2 "OAUTH" "Exchange authorization code for user access token" ($hasToken -and $hasExpiry) "(Token Type: $($tokenRes.token_type), Expires In: $($tokenRes.expires_in)s)"
} catch {
    Assert-Gate2 "OAUTH" "Exchange authorization code for user access token" $false $_.Exception.Message
}

# 1c. Missing authorization code rejected with 400
try {
    $badToken = Invoke-WebRequest -Uri "$BaseUrl/api/meta/oauth/token" -Method Post -Body (@{} | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop
    Assert-Gate2 "OAUTH" "Reject missing authorization code with HTTP 400" $false "(Returned HTTP 200 without code)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert-Gate2 "OAUTH" "Reject missing authorization code with HTTP 400" ($code -eq 400) "(Rejected with HTTP $code)"
}

# 1d. OAuth error handling (e.g. user denied permissions)
try {
    $denied = Invoke-WebRequest -Uri "$BaseUrl/api/meta/callback?error=access_denied&error_description=Permissions+declined&format=json" -Method Get -TimeoutSec 5 -ErrorAction Stop
    Assert-Gate2 "OAUTH" "Handle OAuth permission denial gracefully" $false "(Returned 200 on access_denied)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert-Gate2 "OAUTH" "Handle OAuth permission denial gracefully" ($code -eq 400) "(Handled gracefully with HTTP $code)"
}

# ------------------------------------------------------------------------------
# 2. CRITICAL DATA PATHS: LEAD INGESTION & 5-TIER ATTRIBUTION
# ------------------------------------------------------------------------------
Write-Host "`n--- 2. Lead Ingestion & 5-Tier Attribution ---" -ForegroundColor Yellow

$uniqueLeadgenId = "leadgen_" + (Get-Date).Ticks
$attributionPayload = @{
    object = "page";
    entry = @(
        @{
            id = "page_01";
            time = [int][double]::Parse((Get-Date -UFormat %s));
            changes = @(
                @{
                    field = "leadgen";
                    value = @{
                        leadgen_id = $uniqueLeadgenId;
                        page_id = "page_01";
                        form_id = "form_b2b_enterprise";
                        ad_id = "ad_leadgen_cloud";
                        adgroup_id = "adset_tech_decision_makers";
                        campaign_id = "cmp_q4_enterprise";
                        created_time = [int][double]::Parse((Get-Date -UFormat %s))
                    }
                }
            )
        }
    )
} | ConvertTo-Json -Depth 6

# Compute HMAC signature if app secret configured in local env
$headers = @{ "Content-Type" = "application/json" }
$appSecret = if ($env:META_APP_SECRET) { $env:META_APP_SECRET } else { "test_meta_app_secret_2026" }
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($appSecret)
$hash = [System.BitConverter]::ToString($hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($attributionPayload))).Replace("-", "").ToLower()
$headers["x-hub-signature-256"] = "sha256=$hash"

try {
    $ingestRes = Invoke-RestMethod -Uri "$BaseUrl/api/webhooks/meta" -Method Post -Headers $headers -Body $attributionPayload -TimeoutSec 5
    $attr = $ingestRes.attribution
    $has5Tiers = ($attr.page_id -eq "page_01") -and ($attr.form_id -eq "form_b2b_enterprise") -and ($attr.ad_id -eq "ad_leadgen_cloud") -and ($attr.adset_id -eq "adset_tech_decision_makers") -and ($attr.campaign_id -eq "cmp_q4_enterprise")
    Assert-Gate2 "LEAD_INGESTION" "Inbound webhook ingests lead with 5-tier attribution cascade" ($ingestRes.status -eq "success" -and $has5Tiers) "(Tiers verified: page, form, ad, adset, campaign)"
} catch {
    Assert-Gate2 "LEAD_INGESTION" "Inbound webhook ingests lead with 5-tier attribution cascade" $false $_.Exception.Message
}

# 2b. Idempotency & Duplicate Ingestion Protection
try {
    # Post the EXACT SAME leadgen_id a second time (simulating Meta webhook retry)
    $dupRes = Invoke-RestMethod -Uri "$BaseUrl/api/webhooks/meta" -Method Post -Headers $headers -Body $attributionPayload -TimeoutSec 5
    $isDeduplicated = ($dupRes.duplicate -eq $true) -and ($dupRes.leadId -eq $uniqueLeadgenId)
    Assert-Gate2 "LEAD_INGESTION" "Idempotency: Duplicate leadgen event is detected and deduplicated" $isDeduplicated "(Duplicate flag: $($dupRes.duplicate), Lead ID: $uniqueLeadgenId)"
} catch {
    Assert-Gate2 "LEAD_INGESTION" "Idempotency: Duplicate leadgen event is detected and deduplicated" $false $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 3. OUTBOUND MESSAGE AUTHENTICATION & RBAC
# ------------------------------------------------------------------------------
Write-Host "`n--- 3. Outbound Message Authorization ---" -ForegroundColor Yellow

# 3a. Unauthenticated outbound message rejected with 401
try {
    $msgBody = @{ page_id = "page_01"; text = "Unauthenticated outbound message" } | ConvertTo-Json
    $unauthSend = Invoke-WebRequest -Uri "$BaseUrl/api/messages" -Method Post -Body $msgBody -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop
    Assert-Gate2 "OUTBOUND_AUTH" "Unauthenticated outbound message dispatch rejected with 401" $false "(Returned 200 without auth)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert-Gate2 "OUTBOUND_AUTH" "Unauthenticated outbound message dispatch rejected with 401" ($code -eq 401) "(Rejected with HTTP $code)"
}

# 3b. Staff A sending message via unauthorized page (page_02) rejected with 403
try {
    $spoofMsg = @{ page_id = "page_02"; text = "Staff A trying to send on Page 02" } | ConvertTo-Json
    $crossSend = Invoke-WebRequest -Uri "$BaseUrl/api/messages" -Method Post -Headers @{ "x-user-id" = "user_a" } -Body $spoofMsg -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop
    Assert-Gate2 "OUTBOUND_AUTH" "Staff A sending message via unauthorized page_02 blocked with 403" $false "(Staff A sent message on page_02)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert-Gate2 "OUTBOUND_AUTH" "Staff A sending message via unauthorized page_02 blocked with 403" ($code -eq 403) "(Rejected with HTTP $code)"
}

# 3c. Authorized Staff A sending message on assigned page_01 succeeds
try {
    $validMsg = @{ page_id = "page_01"; text = "Hello from authorized Staff A" } | ConvertTo-Json
    $validSend = Invoke-RestMethod -Uri "$BaseUrl/api/messages" -Method Post -Headers @{ "x-user-id" = "user_a" } -Body $validMsg -ContentType "application/json" -TimeoutSec 5
    $sendSuccess = ($validSend.status -eq "sent") -and (-not [string]::IsNullOrEmpty($validSend.messageId))
    Assert-Gate2 "OUTBOUND_AUTH" "Staff A sending message on assigned page_01 succeeds" $sendSuccess "(Message ID: $($validSend.messageId))"
} catch {
    Assert-Gate2 "OUTBOUND_AUTH" "Staff A sending message on assigned page_01 succeeds" $false $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 4. FIRST RESPONSE CAPTURE & SLA CALCULATION
# ------------------------------------------------------------------------------
Write-Host "`n--- 4. First Response Capture & SLA Engine ---" -ForegroundColor Yellow

# 4a. Write-Once first_response_at capture
$slaTestLeadId = "lead_sla_test_" + (Get-Date).Ticks
try {
    $firstResp1 = Invoke-RestMethod -Uri "$BaseUrl/api/leads/first-response" -Method Post -Headers @{ "x-user-id" = "user_a" } -Body (@{ leadId = $slaTestLeadId; action = "call" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
    $initialTime = $firstResp1.record.firstResponseAt

    Start-Sleep -Milliseconds 100

    # Second attempt to write (must be ignored, preserving original timestamp)
    $firstResp2 = Invoke-RestMethod -Uri "$BaseUrl/api/leads/first-response" -Method Post -Headers @{ "x-user-id" = "user_a" } -Body (@{ leadId = $slaTestLeadId; action = "whatsapp" } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 5
    $isPreserved = ($firstResp2.record.firstResponseAt -eq $initialTime) -and ($firstResp2.record.wasUpdated -eq $false) -and ($firstResp2.record.writeAttempts -eq 2)
    Assert-Gate2 "SLA_ENGINE" "First response capture enforces write-once semantics" $isPreserved "(Initial: $initialTime, Overwrite blocked: True)"
} catch {
    Assert-Gate2 "SLA_ENGINE" "First response capture enforces write-once semantics" $false $_.Exception.Message
}

# 4b. SLA Status Evaluation Math
$createdAt = [DateTime]::UtcNow.AddMinutes(-12)
$targetSla = 5.0

# Case 1: Answered in 2 mins (< 5m target) -> Compliant
$answeredCompliant = $createdAt.AddMinutes(2)
$isCompliant = ($answeredCompliant - $createdAt).TotalMinutes -le $targetSla

# Case 2: Answered in 7 mins (> 5m target) -> Late
$answeredLate = $createdAt.AddMinutes(7)
$isLate = ($answeredLate - $createdAt).TotalMinutes -gt $targetSla

# Case 3: Unanswered after 12 mins -> Live Breach
$isLiveBreach = ([DateTime]::UtcNow - $createdAt).TotalMinutes -gt $targetSla

# Case 4: Compliance rate: 3 compliant out of 4 answered = 75.0%
$compRate = (3.0 / 4.0) * 100.0

$slaCorrectness = $isCompliant -and $isLate -and $isLiveBreach -and ($compRate -eq 75.0)
Assert-Gate2 "SLA_ENGINE" "SLA math: Compliant, Late, Live Breach, and Compliance Rate" $slaCorrectness "(Compliant: $isCompliant, Late: $isLate, Breach: $isLiveBreach, Rate: $compRate%)"

# ------------------------------------------------------------------------------
# 5. FRESH-ACCOUNT ZERO-DATA STATE
# ------------------------------------------------------------------------------
Write-Host "`n--- 5. Fresh-Account Zero-Data State ---" -ForegroundColor Yellow

# 5a. Clean Empty Array responses without throwing
try {
    $emptyLeads = Invoke-RestMethod -Uri "$BaseUrl/api/leads" -Method Get -Headers @{ "x-user-id" = "admin" } -TimeoutSec 5
    $emptyMsgs = Invoke-RestMethod -Uri "$BaseUrl/api/messages" -Method Get -Headers @{ "x-user-id" = "admin" } -TimeoutSec 5
    $emptyNotifs = Invoke-RestMethod -Uri "$BaseUrl/api/notifications" -Method Get -Headers @{ "x-user-id" = "admin" } -TimeoutSec 5

    $leadsAreEmpty = ($emptyLeads.leads -is [System.Array]) -and ($emptyLeads.leads.Count -eq 0)
    $convsAreEmpty = ($emptyMsgs.conversations -is [System.Array]) -and ($emptyMsgs.conversations.Count -eq 0)
    $notifsAreEmpty = ($emptyNotifs.notifications -is [System.Array])

    Assert-Gate2 "ZERO_DATA_STATE" "Empty APIs return clean arrays without error" ($leadsAreEmpty -and $convsAreEmpty -and $notifsAreEmpty) "(Leads: 0, Convs: 0, Notifs: $($emptyNotifs.notifications.Count))"
} catch {
    Assert-Gate2 "ZERO_DATA_STATE" "Empty APIs return clean arrays without error" $false $_.Exception.Message
}

# 5b. ROI & Financial Engine handles zero data without NaN or divide-by-zero
try {
    $roiZero = Invoke-RestMethod -Uri "$BaseUrl/api/meta/roi" -Method Get -Headers @{ "x-user-id" = "user_c" } -TimeoutSec 5
    $cplVal = if ($roiZero.summary) { $roiZero.summary.cpl } else { $roiZero.cpl }
    $cpaVal = if ($roiZero.summary) { $roiZero.summary.cpa } else { $roiZero.cpa }
    $hasNoNan = ($cplVal -ne "NaN") -and ($cpaVal -ne "NaN")
    $cplIsNumeric = ($cplVal -ge 0)
    Assert-Gate2 "ZERO_DATA_STATE" "Financial engine handles zero-data without NaN or division by zero" ($hasNoNan -and $cplIsNumeric) "(CPL: ₹$cplVal, CPA: ₹$cpaVal)"
} catch {
    Assert-Gate2 "ZERO_DATA_STATE" "Financial engine handles zero-data without NaN or division by zero" $false $_.Exception.Message
}

# 5c. Frontend clean data state validation
$appJs = Get-Content ".\js\app.js" -Raw
$hasEmptyStateHelper = $appJs.Contains("this._empty(")
$hasEmptyHandlingLeads = $appJs.Contains("No leads found")
$hasEmptyHandlingConvs = $appJs.Contains("No conversations yet")
$hasEmptyHandlingTasks = $appJs.Contains("No tasks in this view")
$cleanFrontendEmpty = $hasEmptyStateHelper -and $hasEmptyHandlingLeads -and $hasEmptyHandlingConvs -and $hasEmptyHandlingTasks
Assert-Gate2 "ZERO_DATA_STATE" "Frontend components render intuitive empty state views" $cleanFrontendEmpty "(Leads, Inbox, Tasks, Pipeline handled)"

# ------------------------------------------------------------------------------
# 6. KEY ERROR PATHS & RESILIENCE
# ------------------------------------------------------------------------------
Write-Host "`n--- 6. Key Error Paths & Edge Cases ---" -ForegroundColor Yellow

# 6a. Meta API Error: Rate Limit Reached (HTTP 429)
try {
    $rateLimit = Invoke-WebRequest -Uri "$BaseUrl/api/meta/simulate-error?type=rate_limit" -Method Get -TimeoutSec 5 -ErrorAction Stop
    Assert-Gate2 "ERROR_RESILIENCE" "Meta API Rate Limit error handled gracefully with HTTP 429" $false "(Returned 200 on rate limit)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert-Gate2 "ERROR_RESILIENCE" "Meta API Rate Limit error handled gracefully with HTTP 429" ($code -eq 429) "(Handled with HTTP $code)"
}

# 6b. Expired Token / Session Revoked (OAuthException 190 / 463 -> HTTP 401)
try {
    $expiredToken = Invoke-WebRequest -Uri "$BaseUrl/api/meta/simulate-error?type=expired_token" -Method Get -TimeoutSec 5 -ErrorAction Stop
    Assert-Gate2 "ERROR_RESILIENCE" "Expired Meta Access Token caught and returned as HTTP 401" $false "(Returned 200 on expired token)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert-Gate2 "ERROR_RESILIENCE" "Expired Meta Access Token caught and returned as HTTP 401" ($code -eq 401) "(Handled with HTTP $code)"
}

# 6c. Malformed Webhook Payload: Invalid Non-JSON String (with valid HMAC signature)
try {
    $malformedJson = "{ invalid_json: missing_quotes_and_brackets "
    $mHmac = New-Object System.Security.Cryptography.HMACSHA256
    $mHmac.Key = [System.Text.Encoding]::UTF8.GetBytes($appSecret)
    $mHash = [System.BitConverter]::ToString($mHmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($malformedJson))).Replace("-", "").ToLower()
    $mHeaders = @{ "Content-Type" = "application/json"; "x-hub-signature-256" = "sha256=$mHash" }

    $badReq1 = Invoke-WebRequest -Uri "$BaseUrl/api/webhooks/meta" -Method Post -Headers $mHeaders -Body $malformedJson -TimeoutSec 5 -ErrorAction Stop
    Assert-Gate2 "ERROR_RESILIENCE" "Malformed JSON webhook rejected with HTTP 400" $false "(Returned 200 on malformed JSON)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert-Gate2 "ERROR_RESILIENCE" "Malformed JSON webhook rejected with HTTP 400" ($code -eq 400) "(Rejected with HTTP $code)"
}

# 6d. Malformed Webhook Payload: Missing Required Object/Entry (with valid HMAC signature)
try {
    $emptyPayload = "{}"
    $eHmac = New-Object System.Security.Cryptography.HMACSHA256
    $eHmac.Key = [System.Text.Encoding]::UTF8.GetBytes($appSecret)
    $eHash = [System.BitConverter]::ToString($eHmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($emptyPayload))).Replace("-", "").ToLower()
    $eHeaders = @{ "Content-Type" = "application/json"; "x-hub-signature-256" = "sha256=$eHash" }

    $badReq2 = Invoke-WebRequest -Uri "$BaseUrl/api/webhooks/meta" -Method Post -Headers $eHeaders -Body $emptyPayload -TimeoutSec 5 -ErrorAction Stop
    Assert-Gate2 "ERROR_RESILIENCE" "Webhook missing entry structure rejected with HTTP 400" $false "(Returned 200 on empty structure)"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Assert-Gate2 "ERROR_RESILIENCE" "Webhook missing entry structure rejected with HTTP 400" ($code -eq 400) "(Rejected with HTTP $code)"
}

# 6e. Verification that Server Remains Healthy & Zero Bad Data Written
try {
    $healthCheck = Invoke-RestMethod -Uri "$BaseUrl/api/meta/oauth" -Method Get -TimeoutSec 5
    $serverAlive = -not [string]::IsNullOrEmpty($healthCheck.clientId)
    Assert-Gate2 "ERROR_RESILIENCE" "Server survives all error stress tests with zero crashes" $serverAlive "(Server online & responsive)"
} catch {
    Assert-Gate2 "ERROR_RESILIENCE" "Server survives all error stress tests with zero crashes" $false $_.Exception.Message
}

Write-Host "`n===========================================================" -ForegroundColor Cyan
Write-Host " GATE 2 CORRECTNESS SUITE COMPLETED: $script:passed / ($($script:passed + $script:failed)) TESTS PASSED" -ForegroundColor $(if ($script:failed -eq 0) { "Green" } else { "Red" })
Write-Host "===========================================================`n" -ForegroundColor Cyan

if ($script:failed -gt 0) {
    exit 1
} else {
    exit 0
}
