# Build standalone HTML artifacts and update zip
$srcDir = "C:\Users\jiban\.gemini\antigravity\scratch\meta-crm-dashboard"
$artifactDir = "C:\Users\jiban\.gemini\antigravity\brain\77cf11b3-ef14-428d-bdb4-85528c60384e"

$css = Get-Content -Raw "$srcDir\css\styles.css"
$supabaseClient = Get-Content -Raw "$srcDir\js\supabase-client.js"
$data = Get-Content -Raw "$srcDir\js\data.js"
$metaService = Get-Content -Raw "$srcDir\js\meta-service.js"
$crmService = Get-Content -Raw "$srcDir\js\crm-service.js"
$appJs = Get-Content -Raw "$srcDir\js\app.js"

$htmlContent = @"
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MetaCRM — Ultra-Modern Meta Ads & CRM Platform</title>
  
  <!-- Tailwind CSS & Antigravity CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>

  <!-- Google Font: Plus Jakarta Sans -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">

  <style>
$css
  </style>
</head>
<body class="bg-[#F5F7FA] text-slate-900 antialiased min-h-screen flex flex-col selection:bg-[#98E85E]/30">

  <!-- Header -->
  <header id="app-header" class="sticky top-0 z-40 bg-white"></header>

  <!-- Main Workspace -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Sidebar (Collapsible) -->
    <aside id="app-sidebar" class="sidebar-expanded bg-white border-r border-[#E8ECF2] hidden md:block transition-all duration-150 ease-in-out"></aside>

    <!-- Main Content -->
    <main class="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-5 max-w-7xl mx-auto w-full">
      <div id="main-content-container"></div>
    </main>
  </div>

  <div id="toast-container" class="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none"></div>

  <!-- Meta / Facebook JavaScript SDK -->
  <div id="fb-root"></div>

  <!-- Supabase & App Scripts -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script>
$supabaseClient
  </script>
  <script>
$data
  </script>
  <script>
$metaService
  </script>
  <script>
$crmService
  </script>
  <script>
$appJs
  </script>
  <script>
    document.addEventListener("DOMContentLoaded", function() {
      if (!window.app) {
        window.app = new MetaCRMApp();
      }
    });
  </script>
</body>
</html>
"@

# Write standalone full dashboard
[System.IO.File]::WriteAllText("$artifactDir\meta_crm_dashboard.html", $htmlContent, [System.Text.Encoding]::UTF8)
Write-Host "Wrote meta_crm_dashboard.html successfully"

# Write preview widget
[System.IO.File]::WriteAllText("$artifactDir\preview_widget.html", $htmlContent, [System.Text.Encoding]::UTF8)
Write-Host "Wrote preview_widget.html successfully"

# Zip up production folder
$zipPath = "$artifactDir\meta-crm-dashboard-production.zip"
if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}
Compress-Archive -Path "$srcDir\*" -DestinationPath $zipPath -Force
Write-Host "Wrote meta-crm-dashboard-production.zip successfully"
