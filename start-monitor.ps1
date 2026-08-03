# UTF-8 console + start monitor (migrate → sync → worker → browser)
$ErrorActionPreference = 'Stop'
try { chcp 65001 > $null } catch {}
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
Set-Location $PSScriptRoot

Write-Host '========================================'
Write-Host ' Anti-reverse monitor launcher'
Write-Host ' migrate + sync + worker + browser'
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

Write-Host '[1/4] Applying local DB migrations...'
node --env-file=.env.local scripts/ensure-db-migrations.mjs
if ($LASTEXITCODE -ne 0) {
  Write-Host '[ERROR] DB migration failed.' -ForegroundColor Red
  Read-Host 'Press Enter to exit'
  exit 1
}

Write-Host ''
Write-Host '[2/4] Syncing registry devices from Mongo to local SQLite...'
npm run source:sync
if ($LASTEXITCODE -ne 0) {
  Write-Host '[ERROR] source:sync failed.' -ForegroundColor Red
  Read-Host 'Press Enter to exit'
  exit 1
}

Write-Host ''
Write-Host '[3/4] Starting source:worker in a new window...'
Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', "chcp 65001>nul & cd /d `"$PWD`" & npm run source:worker")

Write-Host '[4/4] Starting / reusing Next.js and opening browser...'
& "$PSScriptRoot\scripts\open-monitor.ps1"
if ($LASTEXITCODE -ne 0) {
  Write-Host '[WARN] Auto-open browser failed. Open http://localhost:3000/devices manually.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Done. You can close this window; keep source-worker and Next.js windows open.' -ForegroundColor Green
Read-Host 'Press Enter to exit'