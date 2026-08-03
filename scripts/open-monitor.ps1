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

$url = 'http://localhost:3000/devices'
if (-not (Test-PortOpen 3000)) {
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
} else {
  Write-Host '[open-monitor] detected existing server on :3000'
}

Start-Process $url
Write-Host "[open-monitor] opened $url"
