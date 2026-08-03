# UTF-8 console + start monitor (migrate → apply SN map → sync → worker → browser)
$ErrorActionPreference = 'Stop'
try { chcp 65001 > $null } catch {}
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
Set-Location $PSScriptRoot

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
Write-Host '[2/5] Applying SN map Excel → config/devices.json...'
if (-not (Test-Path 'config\device-sn-map.xlsx')) {
  Write-Host '[ERROR] Missing config\device-sn-map.xlsx (SN ↔ device_id map).' -ForegroundColor Red
  Read-Host 'Press Enter to exit'
  exit 1
}
npm run devices:apply-map
if ($LASTEXITCODE -ne 0) {
  Write-Host '[ERROR] devices:apply-map failed.' -ForegroundColor Red
  Read-Host 'Press Enter to exit'
  exit 1
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
& "$PSScriptRoot\scripts\open-monitor.ps1"
if ($LASTEXITCODE -ne 0) {
  Write-Host '[WARN] Auto-open browser failed. Open http://localhost:3000/devices manually.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Done. You can close this window; keep source-worker and Next.js windows open.' -ForegroundColor Green
Write-Host 'Worker should log: [source:worker] cycle status=completed ...' -ForegroundColor DarkGray
Read-Host 'Press Enter to exit'