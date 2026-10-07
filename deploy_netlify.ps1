param (
  [string]$Token = $env:NETLIFY_AUTH_TOKEN,
  [string]$SiteName = "metacrm-multi-page"
)

Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host " MetaCRM — Automated Netlify Production Deployer" -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan

$zipPath = "C:\Users\jiban\.gemini\antigravity\brain\77cf11b3-ef14-428d-bdb4-85528c60384e\meta-crm-netlify-deploy.zip"

if (-not (Test-Path $zipPath)) {
  Write-Error "Deployment package not found at: $zipPath"
  exit 1
}

if (-not $Token) {
  Write-Host "No NETLIFY_AUTH_TOKEN provided." -ForegroundColor Yellow
  Write-Host "You can deploy your production CRM in 1 step:" -ForegroundColor Green
  Write-Host "1. Open https://app.netlify.com/drop in your browser" -ForegroundColor White
  Write-Host "2. Drag and drop the deploy package:" -ForegroundColor White
  Write-Host "   $zipPath" -ForegroundColor Yellow
  Write-Host "3. Your site will instantly go live with a public https://*.netlify.app URL!" -ForegroundColor Green
  exit 0
}

Write-Host "Authenticating with Netlify API..." -ForegroundColor Cyan
$headers = @{
  "Authorization" = "Bearer $Token"
  "User-Agent" = "MetaCRM-Deployer/1.0"
}

try {
  $body = @{ name = $SiteName } | ConvertTo-Json
  Write-Host "Deploying site to Netlify..." -ForegroundColor Cyan
  
  $bytes = [System.IO.File]::ReadAllBytes($zipPath)
  $deployUrl = "https://api.netlify.com/api/v1/sites"
  
  $response = Invoke-RestMethod -Uri $deployUrl -Method Post -Headers $headers -Body $body -ContentType "application/json" -ErrorAction Stop
  $siteId = $response.id
  $siteUrl = $response.ssl_url
  
  Write-Host "Site created: $siteUrl" -ForegroundColor Green
  
  $uploadUrl = "https://api.netlify.com/api/v1/sites/$siteId/deploys"
  $deployResponse = Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers @{ "Authorization" = "Bearer $Token"; "Content-Type" = "application/zip" } -Body $bytes
  
  $liveUrl = $deployResponse.ssl_url
  $adminUrl = $deployResponse.admin_url
  Write-Host "===========================================================" -ForegroundColor Green
  Write-Host " SUCCESS: Production CRM Deployed Live to Netlify!" -ForegroundColor Green
  Write-Host " Public URL: $liveUrl" -ForegroundColor Yellow
  Write-Host " Admin URL:  $adminUrl" -ForegroundColor Cyan
  Write-Host "===========================================================" -ForegroundColor Green
} catch {
  Write-Host "Deployment error:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
}
