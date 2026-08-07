# 每日 IoT 设备注册表同步 —— 供 Windows 计划任务在 0:00 调用。
# 只做一件事：把造梦者 IoT 平台的设备列表刷进 config/devices.json。
# 不启动 Web / Worker，适合无头（headless）定时任务。
# 用法：powershell -File scripts/sync-iot-daily.ps1
#       或由 sync-iot-daily.cmd 包装后交给 schtasks 0:00 触发。
$ErrorActionPreference = 'Stop'
try { chcp 65001 > $null } catch {}
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

# 仓库根目录：脚本在 scripts/ 下，父目录即仓库根。
# 优先用 $PSScriptRoot（powershell -File 调用时有效）；
# 兜底用 $PWD（.cmd 已 cd 到仓库根；部分 -Command 调用下 $PSScriptRoot 为空）。
$repo = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { $PWD.Path }
Set-Location $repo

# 日志：logs/sync-iot-daily-YYYY-MM-DD.log（同一天追加）
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
  Log '[sync-iot-daily][ERROR] 缺少 .env.local — 请从 .env.local.example 复制并填好 DREAM_MAKER_IOT_TOKEN'
  exit 1
}

# 核心：造梦者 IoT 平台 → config/devices.json（npm script 自带 --env-file=.env.local）
Log '[1/1] npm run devices:sync-iot (造梦者 → config/devices.json)'
npm run devices:sync-iot *>> $logFile
if ($LASTEXITCODE -ne 0) {
  Log ("[sync-iot-daily][ERROR] devices:sync-iot 退出码 {0}" -f $LASTEXITCODE)
  exit $LASTEXITCODE
}

Log '[sync-iot-daily] ===== done ====='
exit 0
