import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const helperPath = path.join(root, 'scripts', 'ensure-node-runtime.ps1')

function quotePowerShell(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

describe('ensure-node-runtime', () => {
  it('repairs missing project packages through npm.cmd and wires both cmd entrypoints to it', async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'anti-reverse-node-runtime-'))
    const npmLog = path.join(fixture, 'npm-args.txt')
    const fakeNpm = `@echo off\r\n` +
      `echo %*>> "%~dp0npm-args.txt"\r\n` +
      `if /I "%~1"=="ls" (\r\n` +
      `  if exist "node_modules\\.healthy" exit /b 0\r\n` +
      `  exit /b 1\r\n` +
      `)\r\n` +
      `if /I "%~1"=="ci" (\r\n` +
      `  if not exist "node_modules" mkdir "node_modules"\r\n` +
      `  type nul > "node_modules\\.package-lock.json"\r\n` +
      `  type nul > "node_modules\\.healthy"\r\n` +
      `  exit /b 0\r\n` +
      `)\r\n` +
      `exit /b 0\r\n`
    await writeFile(path.join(fixture, 'npm.cmd'), fakeNpm)
    await mkdir(path.join(fixture, 'node_modules'), { recursive: true })
    await writeFile(path.join(fixture, 'node_modules', '.package-lock.json'), '')

    try {
      const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
      const runtimePath = [fixture, path.dirname(process.execPath), path.join(systemRoot, 'System32')].join(path.delimiter)
      const command = [
        `$env:Path = ${quotePowerShell(runtimePath)}`,
        `Set-Location -LiteralPath ${quotePowerShell(fixture)}`,
        `. ${quotePowerShell(helperPath)}`,
        'Ensure-NodeRuntime -EnsureProjectDependencies | Out-Null'
      ].join('; ')
      const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      const result = spawnSync(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
        cwd: fixture,
        encoding: 'utf8'
      })

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(await readFile(npmLog, 'utf8')).toContain('ls --depth=0 --omit=optional')
      expect(await readFile(npmLog, 'utf8')).toContain('ci')

      const helper = await readFile(helperPath, 'utf8')
      expect(helper).toContain("Get-Command 'npm.cmd'")
      expect(helper).toContain('OpenJS.NodeJS.LTS')

      const startMonitor = await readFile(path.join(root, 'start-monitor.ps1'), 'utf8')
      const dailySync = await readFile(path.join(root, 'scripts', 'sync-iot-daily.ps1'), 'utf8')
      expect(startMonitor).toContain('ensure-node-runtime.ps1')
      expect(startMonitor).toContain('Ensure-NodeRuntime -EnsureProjectDependencies')
      expect(dailySync).toContain('ensure-node-runtime.ps1')
      expect(dailySync).toContain('Ensure-NodeRuntime -EnsureProjectDependencies')
    } finally {
      await rm(fixture, { recursive: true, force: true })
    }
  })
})
