# UTF-8 console + start monitor (migrate → apply SN map → sync → worker → browser)
$ErrorActionPreference = 'Stop'
try { chcp 65001 > $null } catch {}
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$repo = if ($PSScriptRoot) { $PSScriptRoot } else { $PWD.Path }
Set-Location $repo

Write-Host '========================================'
Write-Host ' Anti-reverse monitor launcher'
Write-Host ' migrate + SN map + sync + worker + browser'
Write-Host '========================================'
Write-Host ''

if (-not (Test-Path '.env.local')) {
  Write-Host '[ERROR] Missing .env.local. Copy from .env.local.example and fill Mongo settings.' -ForegroundColor Red
  Read-Host 'Press Enter to exit'
  exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '[ERROR] node not found. Install Node.js first.' -ForegroundColor Red
  Read-Host 'Press Enter to exit'
  exit 1
}

Write-Host '[1/5] Applying local DB migrations...'
node --env-file=.env.local scripts/ensure-db-migrations.mjs
if ($LASTEXITCODE -ne 0) {
  Write-Host '[ERROR] DB migration failed.' -ForegroundColor Red
  Read-Host 'Press Enter to exit'
  exit 1
}

Write-Host ''
Write-Host '[2/5] Ensuring SN registry (config/devices.json)...'
if (-not (Test-Path 'config\devices.json')) {
  if (Test-Path 'config\devices.example.json') {
    Copy-Item 'config\devices.example.json' 'config\devices.json' -Force
    Write-Host '[OK] Seeded config/devices.json from devices.example.json (12 CT SN ↔ device_id).'
  } else {
    Write-Host '[ERROR] Missing config/devices.json and config/devices.example.json.' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
  }
}
if (Test-Path 'config\device-sn-map.xlsx') {
  Write-Host '[2/5] Applying SN map Excel → config/devices.json...'
  npm run devices:apply-map
  if ($LASTEXITCODE -ne 0) {
    Write-Host '[ERROR] devices:apply-map failed.' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
  }
} else {
  Write-Host '[WARN] config/device-sn-map.xlsx missing; using tracked config/devices.json as-is.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '[2b] Syncing IoT device registry (造梦者 → config/devices.json)...'
npm run devices:sync-iot
if ($LASTEXITCODE -ne 0) {
  Write-Host '[WARN] devices:sync-iot failed (non-fatal); registry may be stale.' -ForegroundColor Yellow
} else {
  Write-Host '[OK] IoT device registry refreshed.'
}

Write-Host ''
Write-Host '[3/5] Syncing registry devices from Mongo to local SQLite...'
npm run source:sync
if ($LASTEXITCODE -ne 0) {
  Write-Host '[ERROR] source:sync failed.' -ForegroundColor Red
  Read-Host 'Press Enter to exit'
  exit 1
}

Write-Host ''
Write-Host '[4/5] Starting source:worker in a new window (heap 4096 MB)...'
$existingWorker = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -match 'source-sync-worker' }
if ($existingWorker) {
  Write-Host ("[WARN] source:worker already running (pid {0}); skip starting a second copy." -f ($existingWorker | Select-Object -First 1 -ExpandProperty ProcessId)) -ForegroundColor Yellow
} else {
  # Explicit heap on the child process: default Node heap OOMs when Next.dev already holds ~2–3 GB.
  $workerCmd = "chcp 65001>nul & cd /d `"$PWD`" & set NODE_OPTIONS=--max-old-space-size=4096& npm run source:worker"
  Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', $workerCmd)
}

Write-Host '[5/5] Starting / reusing Next.js and opening browser...'
& "$repo\scripts\open-monitor.ps1"
if ($LASTEXITCODE -ne 0) {
  Write-Host '[WARN] Auto-open browser failed. Open http://localhost:3000/devices manually.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '[watchdog] Ensuring Next health watchdog is running...'
$existingWatchdog = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -match 'next-watchdog\.ps1' }
if ($existingWatchdog) {
  Write-Host ("[watchdog] already running (pid {0}); skip." -f ($existingWatchdog | Select-Object -First 1 -ExpandProperty ProcessId)) -ForegroundColor Yellow
} else {
  Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "$PSScriptRoot\scripts\next-watchdog.ps1"
  ) -WindowStyle Normal
  Write-Host '[watchdog] started in a new window (auto-restart if Next wedges).' -ForegroundColor Cyan
}

Write-Host ''
Write-Host 'Done. Keep source-worker, Next.js, and next-watchdog windows open.' -ForegroundColor Green
Write-Host 'Worker should log: [source:worker] cycle status=completed ...' -ForegroundColor DarkGray
Write-Host 'Watchdog probes /api/live every 30s; wedged Next is killed and restarted.' -ForegroundColor DarkGray
Read-Host 'Press Enter to exit'