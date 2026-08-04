# Next.js health watchdog: if :3000 listens but /api/live times out / fails, kill and restart.
# Keep this window open while developing. Ctrl+C to stop watching (does not stop Next).
$ErrorActionPreference = 'Continue'
try { chcp 65001 > $null } catch {}
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
Set-Location (Split-Path $PSScriptRoot -Parent)

$Port = 3000
$ProbeUrl = 'http://127.0.0.1:3000/api/live'
$IntervalSec = 30
$ProbeTimeoutSec = 8
$FailThreshold = 2
$RestartCooldownSec = 90
$StartDeadlineSec = 120
$HeapMb = 4096

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

function Test-NextHealthy([int]$TimeoutSec = 8) {
  try {
    $response = Invoke-WebRequest -Uri $ProbeUrl -UseBasicParsing -TimeoutSec $TimeoutSec
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Stop-WedgedNext {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and (
        $_.CommandLine -match 'next(\\dist\\bin\\next|\\dist\\server\\lib\\start-server)' -or
        $_.CommandLine -match 'next dev'
      )
    } |
    ForEach-Object {
      Write-Host ("[{0}] stopping Next pid {1}" -f (Get-Date -Format 'HH:mm:ss'), $_.ProcessId) -ForegroundColor Yellow
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Start-NextDev {
  $repo = (Get-Location).Path
  $cmd = "chcp 65001>nul & cd /d `"$repo`" & set NODE_OPTIONS=--max-old-space-size=$HeapMb& npm run dev"
  Write-Host ("[{0}] starting npm run dev (heap {1} MB)..." -f (Get-Date -Format 'HH:mm:ss'), $HeapMb) -ForegroundColor Cyan
  Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', $cmd) -WindowStyle Normal
}

function Wait-NextReady([int]$DeadlineSec) {
  $deadline = (Get-Date).AddSeconds($DeadlineSec)
  while ((Get-Date) -lt $deadline) {
    if ((Test-PortOpen $Port) -and (Test-NextHealthy 15)) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

Write-Host '========================================'
Write-Host ' Next.js watchdog (auto-restart on wedge)'
Write-Host (" probe {0} every {1}s, timeout {2}s, fail×{3}" -f $ProbeUrl, $IntervalSec, $ProbeTimeoutSec, $FailThreshold)
Write-Host '========================================'
Write-Host ''

$fails = 0
$lastRestart = [datetime]::MinValue

while ($true) {
  $listening = Test-PortOpen $Port
  if (-not $listening) {
    Write-Host ("[{0}] :{1} not listening — starting Next..." -f (Get-Date -Format 'HH:mm:ss'), $Port) -ForegroundColor Yellow
    Start-NextDev
    if (Wait-NextReady $StartDeadlineSec) {
      Write-Host ("[{0}] Next ready" -f (Get-Date -Format 'HH:mm:ss')) -ForegroundColor Green
      $fails = 0
    } else {
      Write-Host ("[{0}] Next did not become healthy within {1}s" -f (Get-Date -Format 'HH:mm:ss'), $StartDeadlineSec) -ForegroundColor Red
    }
    Start-Sleep -Seconds $IntervalSec
    continue
  }

  if (Test-NextHealthy $ProbeTimeoutSec) {
    if ($fails -gt 0) {
      Write-Host ("[{0}] healthy again (cleared {1} fail(s))" -f (Get-Date -Format 'HH:mm:ss'), $fails) -ForegroundColor Green
    }
    $fails = 0
  } else {
    $fails++
    Write-Host ("[{0}] unhealthy ({1}/{2}) — port up but {3} failed" -f (Get-Date -Format 'HH:mm:ss'), $fails, $FailThreshold, $ProbeUrl) -ForegroundColor Yellow
    if ($fails -ge $FailThreshold) {
      $since = ((Get-Date) - $lastRestart).TotalSeconds
      if ($since -lt $RestartCooldownSec) {
        Write-Host ("[{0}] restart cooldown {1:N0}s left — skip" -f (Get-Date -Format 'HH:mm:ss'), ($RestartCooldownSec - $since)) -ForegroundColor DarkYellow
      } else {
        Write-Host ("[{0}] wedged — restarting Next..." -f (Get-Date -Format 'HH:mm:ss')) -ForegroundColor Magenta
        Stop-WedgedNext
        Start-Sleep -Seconds 2
        Start-NextDev
        $lastRestart = Get-Date
        if (Wait-NextReady $StartDeadlineSec) {
          Write-Host ("[{0}] restart OK" -f (Get-Date -Format 'HH:mm:ss')) -ForegroundColor Green
          $fails = 0
        } else {
          Write-Host ("[{0}] restart attempted but still unhealthy" -f (Get-Date -Format 'HH:mm:ss')) -ForegroundColor Red
        }
      }
    }
  }

  Start-Sleep -Seconds $IntervalSec
}
