# ==============================================================================
# MetaCRM Local Development & API Proxy Server (PowerShell)
# Serves static frontend assets AND handles /api/* Meta & Zernio endpoints
# ==============================================================================
param (
    [int]$Port = 3000
)

$baseDir = $PSScriptRoot

# Load environment variables from .env if present
$envFile = Join-Path $baseDir ".env"
$envVars = @{}
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line.Split("=", 2)
            $key = $parts[0].Trim()
            $val = $parts[1].Trim().Trim('"').Trim("'")
            $envVars[$key] = $val
            [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
        }
    }
}

$META_APP_ID = $envVars["META_APP_ID"]
$META_APP_SECRET = $envVars["META_APP_SECRET"]
$META_TOKEN = if ($envVars["META_SYSTEM_USER_ACCESS_TOKEN"]) { $envVars["META_SYSTEM_USER_ACCESS_TOKEN"] } else { $envVars["META_ACCESS_TOKEN"] }
$META_VERSION = if ($envVars["META_API_VERSION"]) { $envVars["META_API_VERSION"] } else { "v20.0" }
$VERIFY_TOKEN = if ($envVars["META_VERIFY_TOKEN"]) { $envVars["META_VERIFY_TOKEN"] } else { "meta_crm_wh_verify_secret_2026" }

# Zernio API Configuration
$ZERNIO_API_KEY = if ($envVars["ZERNIO_API_KEY"]) { $envVars["ZERNIO_API_KEY"] } else { "sk_70e384c607a377dd9cc9e1585a8def99688e735a3a47d515b2255808055dabe1" }
$ZERNIO_PROFILE_ID = if ($envVars["ZERNIO_PROFILE_ID"]) { $envVars["ZERNIO_PROFILE_ID"] } else { "6ac64ff53904c4c3acfa60fd" }
$ZERNIO_BASE_URL = if ($envVars["ZERNIO_BASE_URL"]) { $envVars["ZERNIO_BASE_URL"] } else { "https://zernio.com/api/v1" }

function Send-JsonResponse($res, [int]$statusCode, $obj) {
    try {
        $json = $obj | ConvertTo-Json -Depth 6
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
        $res.ContentType = "application/json; charset=utf-8"
        $res.StatusCode = $statusCode
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        $res.OutputStream.Flush()
    } finally {
        $res.Close()
    }
}

function Send-TextResponse($res, [int]$statusCode, [string]$text) {
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
        $res.ContentType = "text/plain; charset=utf-8"
        $res.StatusCode = $statusCode
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        $res.OutputStream.Flush()
    } finally {
        $res.Close()
    }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " MetaCRM Production Platform Server Started (Port $Port)" -ForegroundColor Green
Write-Host " URL: http://localhost:$Port" -ForegroundColor Yellow
Write-Host " Meta Graph API Version: $META_VERSION" -ForegroundColor DarkCyan
if ($ZERNIO_API_KEY) {
    Write-Host " Zernio Unified API: ACTIVE (Profile: $ZERNIO_PROFILE_ID)" -ForegroundColor Green
}
if ($META_TOKEN) {
    Write-Host " Direct Meta Access Token: Configured" -ForegroundColor Green
} else {
    Write-Host " Direct Meta Token: Using Zernio Verified Integration Gateway" -ForegroundColor Yellow
}
Write-Host " Press Ctrl+C in this console to stop the server." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        Write-Host "[HTTP] $($request.HttpMethod) $($request.Url.LocalPath)" -ForegroundColor DarkGray

        # Add CORS Headers
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
        $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Hub-Signature-256, X-Zernio-Signature")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        $urlPath = $request.Url.LocalPath
        $queryString = $request.Url.Query

        # ----------------------------------------------------------------------
        # API ROUTING: /api/*
        # ----------------------------------------------------------------------
        if ($urlPath.StartsWith("/api/")) {

            # GET /api/zernio/status (Tests live connection to Zernio API)
            if ($urlPath -eq "/api/zernio/status" -and $request.HttpMethod -eq "GET") {
                try {
                    $zHeaders = @{ "Authorization" = "Bearer $ZERNIO_API_KEY" }
                    $profRes = Invoke-RestMethod -Uri "$ZERNIO_BASE_URL/profiles" -Headers $zHeaders -Method Get -TimeoutSec 8
                    $accRes = Invoke-RestMethod -Uri "$ZERNIO_BASE_URL/accounts" -Headers $zHeaders -Method Get -TimeoutSec 8

                    $activeProfile = if ($profRes.profiles -and $profRes.profiles.Count -gt 0) { $profRes.profiles[0] } else { $null }
                    $accountsList = if ($accRes.accounts) { $accRes.accounts } else { @() }

                    $statusObj = @{
                        status = "connected";
                        provider = "zernio";
                        apiKey = "sk_70e384c6..." + $ZERNIO_API_KEY.Substring($ZERNIO_API_KEY.Length - 6);
                        profile = $activeProfile;
                        accounts = $accountsList;
                        hasAnalyticsAccess = $accRes.hasAnalyticsAccess;
                        verifiedGateway = $true;
                        appReviewBypassed = $true;
                        timestamp = (Get-Date).ToString("o")
                    }
                    Send-JsonResponse $response 200 $statusObj
                } catch {
                    Send-JsonResponse $response 500 @{ status = "error"; message = $_.Exception.Message }
                }
                continue
            }

            # GET /api/zernio/connect/facebook (Gets live Facebook OAuth Connect URL)
            if ($urlPath -eq "/api/zernio/connect/facebook" -and $request.HttpMethod -eq "GET") {
                try {
                    $zHeaders = @{ "Authorization" = "Bearer $ZERNIO_API_KEY" }
                    $redirectUrl = "http://localhost:$Port/?zernio_connected=facebook"
                    $uri = "$ZERNIO_BASE_URL/connect/facebook?profileId=$ZERNIO_PROFILE_ID&redirect_url=$([System.Uri]::EscapeDataString($redirectUrl))"
                    $connRes = Invoke-RestMethod -Uri $uri -Headers $zHeaders -Method Get -TimeoutSec 8
                    Send-JsonResponse $response 200 $connRes
                } catch {
                    Send-JsonResponse $response 500 @{ error = $_.Exception.Message }
                }
                continue
            }

            # GET /api/zernio/connect/ads (Gets live Meta Ads Connect URL)
            if ($urlPath -eq "/api/zernio/connect/ads" -and $request.HttpMethod -eq "GET") {
                try {
                    $zHeaders = @{ "Authorization" = "Bearer $ZERNIO_API_KEY" }
                    $redirectUrl = "http://localhost:$Port/?zernio_connected=ads"
                    $uri = "$ZERNIO_BASE_URL/connect/facebook/ads?profileId=$ZERNIO_PROFILE_ID&redirect_url=$([System.Uri]::EscapeDataString($redirectUrl))"
                    $connRes = Invoke-RestMethod -Uri $uri -Headers $zHeaders -Method Get -TimeoutSec 8
                    Send-JsonResponse $response 200 $connRes
                } catch {
                    Send-JsonResponse $response 500 @{ error = $_.Exception.Message }
                }
                continue
            }

            # GET /api/zernio/connect/instagram (Gets live Instagram Connect URL)
            if ($urlPath -eq "/api/zernio/connect/instagram" -and $request.HttpMethod -eq "GET") {
                try {
                    $zHeaders = @{ "Authorization" = "Bearer $ZERNIO_API_KEY" }
                    $redirectUrl = "http://localhost:$Port/?zernio_connected=instagram"
                    $uri = "$ZERNIO_BASE_URL/connect/instagram?profileId=$ZERNIO_PROFILE_ID&redirect_url=$([System.Uri]::EscapeDataString($redirectUrl))"
                    $connRes = Invoke-RestMethod -Uri $uri -Headers $zHeaders -Method Get -TimeoutSec 8
                    Send-JsonResponse $response 200 $connRes
                } catch {
                    Send-JsonResponse $response 500 @{ error = $_.Exception.Message }
                }
                continue
            }

            # GET /api/zernio/accounts (Fetch connected accounts)
            if ($urlPath -eq "/api/zernio/accounts" -and $request.HttpMethod -eq "GET") {
                try {
                    $zHeaders = @{ "Authorization" = "Bearer $ZERNIO_API_KEY" }
                    $accRes = Invoke-RestMethod -Uri "$ZERNIO_BASE_URL/accounts" -Headers $zHeaders -Method Get -TimeoutSec 8
                    Send-JsonResponse $response 200 $accRes
                } catch {
                    Send-JsonResponse $response 500 @{ error = $_.Exception.Message }
                }
                continue
            }

            # GET /api/zernio/inbox/conversations (Fetch conversations from Zernio)
            if ($urlPath -eq "/api/zernio/inbox/conversations" -and $request.HttpMethod -eq "GET") {
                try {
                    $zHeaders = @{ "Authorization" = "Bearer $ZERNIO_API_KEY" }
                    $convRes = Invoke-RestMethod -Uri "$ZERNIO_BASE_URL/inbox/conversations" -Headers $zHeaders -Method Get -TimeoutSec 8
                    Send-JsonResponse $response 200 $convRes
                } catch {
                    Send-JsonResponse $response 200 @{ data = @(); error = $_.Exception.Message }
                }
                continue
            }

            # POST /api/zernio/simulate-lead (Simulate real inbound lead via Zernio)
            if ($urlPath -eq "/api/zernio/simulate-lead" -and $request.HttpMethod -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $bodyStr = $reader.ReadToEnd()
                $leadInput = if ($bodyStr) { $bodyStr | ConvertFrom-Json } else { @{} }

                $simulatedLead = @{
                    id = "lead_zn_" + (Get-Random -Minimum 100000 -Maximum 999999);
                    name = if ($leadInput.name) { $leadInput.name } else { "Simulated Prospect " + (Get-Random -Minimum 10 -Maximum 99) };
                    email = if ($leadInput.email) { $leadInput.email } else { "prospect" + (Get-Random -Minimum 10 -Maximum 99) + "@example.com" };
                    phone = if ($leadInput.phone) { $leadInput.phone } else { "+91 98" + (Get-Random -Minimum 10000000 -Maximum 99999999) };
                    pageId = if ($leadInput.pageId) { $leadInput.pageId } else { "page_01" };
                    campaignId = if ($leadInput.campaignId) { $leadInput.campaignId } else { "cmp_apex_leadgen" };
                    campaignName = if ($leadInput.campaignName) { $leadInput.campaignName } else { "Apex Living - Lead Gen Q4" };
                    adId = if ($leadInput.adId) { $leadInput.adId } else { "ad_apex_01" };
                    adName = if ($leadInput.adName) { $leadInput.adName } else { "Luxury 3BHK Video Tour" };
                    status = "new";
                    source = "Facebook Ads (via Zernio)";
                    attribution = @{
                        page = "Apex Living";
                        campaign = "Apex Living - Lead Gen Q4";
                        ad = "Luxury 3BHK Video Tour";
                        platform = "Facebook Lead Ad";
                        gateway = "Zernio Unified Webhook"
                    };
                    createdAt = (Get-Date).ToString("o")
                }

                Write-Host "[Zernio Simulation] Lead created: $($simulatedLead.name) for $($simulatedLead.pageId)" -ForegroundColor Green
                Send-JsonResponse $response 200 @{ status = "success"; lead = $simulatedLead }
                continue
            }

            # /api/webhooks/zernio (Zernio Webhook Receiver)
            if ($urlPath -eq "/api/webhooks/zernio") {
                if ($request.HttpMethod -eq "GET") {
                    Send-JsonResponse $response 200 @{ status = "active"; provider = "zernio"; message = "Zernio webhook endpoint ready" }
                } elseif ($request.HttpMethod -eq "POST") {
                    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                    $postBody = $reader.ReadToEnd()
                    Write-Host "[Zernio Webhook] Event received: $postBody" -ForegroundColor Green
                    Send-JsonResponse $response 200 @{ status = "success"; provider = "zernio"; timestamp = (Get-Date).ToString("o") }
                }
                continue
            }

            # GET /api/auth/meta/url
            if ($urlPath -eq "/api/auth/meta/url" -and $request.HttpMethod -eq "GET") {
                $redirectUri = "http://localhost:$Port/"
                $scopes = "public_profile,email,pages_show_list,pages_read_engagement,pages_manage_ads,pages_manage_metadata,leads_retrieval,ads_read,ads_management,business_management"
                $appId = if ($META_APP_ID) { $META_APP_ID } else { "849204918204921" }
                $authUrl = "https://www.facebook.com/$META_VERSION/dialog/oauth?client_id=$appId&redirect_uri=$([System.Uri]::EscapeDataString($redirectUri))&scope=$([System.Uri]::EscapeDataString($scopes))&state=local_state&response_type=code"
                Send-JsonResponse $response 200 @{ url = $authUrl }
                continue
            }

            # GET /api/webhooks/meta (Verification Handshake)
            if ($urlPath -eq "/api/webhooks/meta" -and $request.HttpMethod -eq "GET") {
                $query = [System.Web.HttpUtility]::ParseQueryString($queryString)
                $mode = $query["hub.mode"]
                $token = $query["hub.verify_token"]
                $challenge = $query["hub.challenge"]

                if ($mode -eq "subscribe" -and $token -eq $VERIFY_TOKEN) {
                    Send-TextResponse $response 200 $challenge
                } else {
                    Send-TextResponse $response 403 "Verification failed"
                }
                continue
            }

            # Fallback for unknown API routes
            Send-JsonResponse $response 200 @{ status = "ok"; message = "API request received on $urlPath" }
            continue
        }

        # ----------------------------------------------------------------------
        # STATIC FILE SERVING
        # ----------------------------------------------------------------------
        if ($urlPath -eq "/" -or $urlPath -eq "") {
            $urlPath = "/index.html"
        }

        $filePath = Join-Path $baseDir ($urlPath.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar))

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".jpeg" { "image/jpeg" }
                ".svg"  { "image/svg+xml" }
                default { "application/octet-stream" }
            }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.OutputStream.Flush()
            $response.Close()
        } else {
            Send-TextResponse $response 404 "404 Not Found: $urlPath"
        }
    } catch {
        # Catch and continue loop
    }
}
