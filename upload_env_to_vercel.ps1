# ==============================================================================
# Direct Environment Variable Uploader for Vercel
# MetaCRM Deployment Utility
# ==============================================================================
param(
    [string]$EnvFile = ".\.env",
    [string]$VercelToken = "",
    [string]$ProjectName = "crm",
    [string]$TeamId = ""
)

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  MetaCRM Direct Environment Variable Uploader for Vercel" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

if (-not (Test-Path $EnvFile)) {
    Write-Host "[-] Could not find env file at $EnvFile" -ForegroundColor Red
    Write-Host "    Create or copy your .env file with your real Meta credentials first." -ForegroundColor Yellow
    exit 1
}

$lines = Get-Content $EnvFile
$envVars = @()

foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "" -or $trimmed.StartsWith("#")) {
        continue
    }
    $eqIndex = $trimmed.IndexOf("=")
    if ($eqIndex -gt 0) {
        $key = $trimmed.Substring(0, $eqIndex).Trim()
        $val = $trimmed.Substring($eqIndex + 1).Trim()
        # Remove enclosing quotes if present
        if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
            $val = $val.Substring(1, $val.Length - 2)
        }
        $envVars += @{
            key = $key
            value = $val
            type = "plain"
            target = @("production", "preview", "development")
        }
    }
}

Write-Host "[+] Loaded $($envVars.Count) environment variables from $EnvFile" -ForegroundColor Green

if ([string]::IsNullOrWhiteSpace($VercelToken)) {
    Write-Host "`n--------------------------------------------------------" -ForegroundColor Yellow
    Write-Host "METHOD 1: Instant 1-Click Paste into Vercel Dashboard" -ForegroundColor Yellow
    Write-Host "--------------------------------------------------------" -ForegroundColor Yellow
    Write-Host "You do NOT need to enter them one-by-one!" -ForegroundColor White
    Write-Host "1. Go to: https://vercel.com/dashboard" -ForegroundColor White
    Write-Host "2. Click on your project -> Settings -> Environment Variables" -ForegroundColor White
    Write-Host "3. In the 'Key' box, simply paste your ENTIRE .env contents." -ForegroundColor White
    Write-Host "   (Vercel detects the '=' signs and instantly fills ALL keys & values at once!)" -ForegroundColor Green
    Write-Host "4. Click Save.`n" -ForegroundColor White

    Write-Host "METHOD 2: Automated Direct API Upload" -ForegroundColor Yellow
    Write-Host "To push them automatically from this terminal, pass your Vercel Token:" -ForegroundColor White
    Write-Host "powershell -ExecutionPolicy Bypass -File .\upload_env_to_vercel.ps1 -VercelToken 'YOUR_VERCEL_TOKEN' -ProjectName 'crm'`n" -ForegroundColor Cyan
    Write-Host "(Get your Vercel token in 10 seconds at: https://vercel.com/account/tokens)`n" -ForegroundColor Gray
    exit 0
}

# Upload directly via Vercel REST API
$headers = @{
    "Authorization" = "Bearer $VercelToken"
    "Content-Type"  = "application/json"
}

$teamQuery = if ($TeamId) { "?teamId=$TeamId" } else { "" }
$apiUrl = "https://api.vercel.com/v10/projects/$ProjectName/env$teamQuery"

$successCount = 0
$failCount = 0

Write-Host "[*] Uploading $($envVars.Count) variables directly to Vercel project '$ProjectName'..." -ForegroundColor Cyan

foreach ($item in $envVars) {
    try {
        $bodyJson = $item | ConvertTo-Json -Compress
        $res = Invoke-RestMethod -Uri $apiUrl -Method Post -Headers $headers -Body $bodyJson -ErrorAction Stop
        Write-Host "  [+] Uploaded: $($item.key)" -ForegroundColor Green
        $successCount++
    } catch {
        # Check if already exists, try update
        Write-Host "  [!] Note on $($item.key): $($_.Exception.Message)" -ForegroundColor DarkYellow
        $failCount++
    }
}

Write-Host "`n[✓] Done! $successCount variables uploaded directly to Vercel." -ForegroundColor Green
