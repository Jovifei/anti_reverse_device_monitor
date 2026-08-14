# Node/npm 与项目依赖自举：供 Windows 启动入口复用。

function Get-LauncherCommand {
  param([Parameter(Mandatory)][string]$Name)

  Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Update-LauncherPath {
  $pathParts = @(
    $env:Path
    [Environment]::GetEnvironmentVariable('Path', [EnvironmentVariableTarget]::Machine)
    [Environment]::GetEnvironmentVariable('Path', [EnvironmentVariableTarget]::User)
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  $env:Path = $pathParts -join ';'
}

function Ensure-NodeRuntime {
  param([switch]$EnsureProjectDependencies)

  $node = Get-LauncherCommand 'node.exe'
  # 显式使用 .cmd，避免 PowerShell 执行策略拦截 npm.ps1。
  $npm = Get-LauncherCommand 'npm.cmd'
  if (-not $node -or -not $npm) {
    $winget = Get-LauncherCommand 'winget.exe'
    if (-not $winget) {
      throw 'Node.js/npm is missing and winget.exe is unavailable. Install Node.js LTS, then run this launcher again.'
    }

    Write-Host '[bootstrap] Node.js/npm missing; installing Node.js LTS with winget...' -ForegroundColor Yellow
    & $winget.Source install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
      throw "winget failed to install Node.js LTS (exit $LASTEXITCODE)."
    }

    Update-LauncherPath
    $node = Get-LauncherCommand 'node.exe'
    $npm = Get-LauncherCommand 'npm.cmd'
  }

  if (-not $node -or -not $npm) {
    throw 'Node.js/npm was not found after installation. Close this window and run the launcher again.'
  }

  if ($EnsureProjectDependencies) {
    $needsInstall = -not (Test-Path 'node_modules\.package-lock.json')
    if (-not $needsInstall) {
      & $npm.Source ls --depth=0 --omit=optional *> $null
      $needsInstall = $LASTEXITCODE -ne 0
    }

    if ($needsInstall) {
      Write-Host '[bootstrap] Project tools missing or incomplete; installing locked dependencies with npm ci...' -ForegroundColor Yellow
      & $npm.Source ci
      if ($LASTEXITCODE -ne 0) {
        throw "npm ci failed (exit $LASTEXITCODE)."
      }
    }
  }

  [pscustomobject]@{
    Node = $node.Source
    Npm = $npm.Source
  }
}
