# Daily IoT device registry sync (ASCII test copy).
$ErrorActionPreference = 'Stop'
try { chcp 65001 > $null } catch {}
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$repo = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { $PWD.Path }
Set-Location $repo
$logDir = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = (Get-Date).ToString('yyyy-MM-dd')
$logFile = Join-Path $logDir "sync-iot-daily-$stamp.log"
function Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $logFile -Value $line
  Write-Host $line
}
Log '[sync-iot-daily] ===== start ====='
if (-not (Test-Path '.env.local')) {
  Log '[sync-iot-daily][ERROR] missing .env.local'
  exit 1
}
Log '[1/1] npm run devices:sync-iot'
npm run devices:sync-iot *>> $logFile
if ($LASTEXITCODE -ne 0) {
  Log ("[sync-iot-daily][ERROR] devices:sync-iot exit {0}" -f $LASTEXITCODE)
  exit $LASTEXITCODE
}
Log '[sync-iot-daily] ===== done ====='
exit 0
