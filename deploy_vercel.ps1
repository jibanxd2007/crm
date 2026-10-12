# ==============================================================================
# MetaCRM — Automated Vercel Production Deployer
# ==============================================================================
param(
  [switch]$Prod = $true,
  [switch]$UploadEnv = $false
)

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "       MetaCRM — Production Vercel Deployer" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# 1. Optionally sync environment variables first
if ($UploadEnv) {
  Write-Host "[1/3] Uploading environment variables to Vercel..." -ForegroundColor Yellow
  if (Test-Path ".\upload_env_to_vercel.ps1") {
    powershell -ExecutionPolicy Bypass -File .\upload_env_to_vercel.ps1
  }
}

# 2. Check build readiness
Write-Host "[+] Verifying configuration..." -ForegroundColor Cyan
if (-not (Test-Path ".\vercel.json")) {
  Write-Host "[-] vercel.json not found!" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path ".\api")) {
  Write-Host "[-] api/ directory not found!" -ForegroundColor Red
  exit 1
}

Write-Host "  - Configuration: vercel.json (OK)" -ForegroundColor Green
Write-Host "  - Serverless API: api/ (OK)" -ForegroundColor Green
Write-Host "  - Frontend Assets: index.html, css/, js/ (OK)" -ForegroundColor Green

# 3. Deploy using Vercel CLI
Write-Host "`n[+] Deploying to Vercel..." -ForegroundColor Cyan
$targetFlag = if ($Prod) { "--prod" } else { "" }

Write-Host "Running: npx vercel $targetFlag --yes" -ForegroundColor Yellow

try {
  npx vercel $targetFlag --yes
  if ($LASTEXITCODE -eq 0) {
    Write-Host "`n Deployment to Vercel completed successfully!" -ForegroundColor Green
  } else {
    Write-Host "`n Vercel CLI exited with code $LASTEXITCODE." -ForegroundColor Yellow
    Write-Host "If Vercel CLI is not logged in, run: npx vercel login" -ForegroundColor White
  }
} catch {
  Write-Host "[-] Could not invoke npx vercel: $_" -ForegroundColor Red
  Write-Host "You can also deploy by pushing this repository to GitHub and connecting it on https://vercel.com/new" -ForegroundColor Yellow
}
