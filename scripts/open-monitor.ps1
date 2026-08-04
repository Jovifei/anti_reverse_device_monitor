$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

function Test-PortOpen([int]$Port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(400)
    if ($ok -and $client.Connected) { $client.Close(); return $true }
    $client.Close()
    return $false
  } catch {
    return $false
  }
}

function Test-NextHealthy([int]$TimeoutSec = 5) {
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/live' -UseBasicParsing -TimeoutSec $TimeoutSec
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Stop-WedgedNext {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and ($_.CommandLine -match 'next(\\dist\\bin\\next|\\dist\\server\\lib\\start-server)') } |
    ForEach-Object {
      Write-Host ("[open-monitor] stopping wedged Next pid {0}" -f $_.ProcessId) -ForegroundColor Yellow
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

$url = 'http://localhost:3000/devices'
$needStart = $true
if (Test-PortOpen 3000) {
  if (Test-NextHealthy) {
    Write-Host '[open-monitor] detected healthy server on :3000'
    $needStart = $false
  } else {
    Write-Host '[open-monitor] :3000 is listening but not healthy — restarting Next...' -ForegroundColor Yellow
    Stop-WedgedNext
    Start-Sleep -Seconds 2
  }
}

if ($needStart) {
  Write-Host '[open-monitor] starting npm run dev in a new window...'
  $repo = (Get-Location).Path
  Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', "cd /d `"$repo`" && npm run dev") -WindowStyle Normal
  $deadline = (Get-Date).AddMinutes(2)
  while (-not (Test-PortOpen 3000)) {
    if ((Get-Date) -gt $deadline) {
      Write-Error 'Next.js did not become ready on :3000 within 2 minutes.'
    }
    Start-Sleep -Seconds 1
  }
  # Give first compile a moment after accept()
  Start-Sleep -Seconds 2
  if (-not (Test-NextHealthy 15)) {
    Write-Host '[open-monitor] WARN: Next accepted connections but /api/live is still unhealthy.' -ForegroundColor Yellow
  }
}

Start-Process $url
Write-Host "[open-monitor] opened $url"
