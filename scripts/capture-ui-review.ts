import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import type { Browser, Page } from '@playwright/test';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= 'E:\\Claude_allow\\Download\\playwright-browsers';

const root = process.cwd();
const runId = `${process.pid}-${Date.now()}`;
const outputDir = path.join(root, 'artifacts', 'ui-review');
const stagingDir = path.join(outputDir, `.run-${runId}`);
const lockPath = path.join(outputDir, '.capture.lock');
const nextDistDir = path.join(root, `.next-ui-capture-${runId}`);
const temporaryTsconfigPath = path.join(root, `.tsconfig-ui-capture-${runId}.json`);
const demoDatabase = path.join(root, 'data', 'demo-device-monitor.db');
const nextEnvPath = path.join(root, 'next-env.d.ts');
const screenshots = [
  'desktop-ct-main.png',
  'desktop-phase-history-dialog.png',
  'desktop-inverter-grid.png',
  'desktop-inverter-metric-dialog.png',
  'desktop-inverter-offline-history.png',
  'desktop-reverse-flow-alerts.png',
  'mobile-ct-main.png',
  'mobile-inverter-grid.png',
  'mobile-metric-dialog.png'
] as const;

let baseUrl = '';
let server: ChildProcess | undefined;
let browser: Browser | undefined;
let lockHeld = false;
let cleanupTask: Promise<void> | undefined;
let cleanupProblems: string[] = [];
let originalNextEnv: Buffer | undefined;
let captureNextEnv: Buffer | undefined;

function relativeToRoot(target: string) {
  return path.relative(root, target).replaceAll('\\', '/');
}

function trace(field: string, value: string | number) {
  console.log(`[ui:capture] ${field}=${value}`);
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function acquireCaptureLock() {
  await fs.mkdir(outputDir, { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, runId, startedAt: new Date().toISOString() }));
      } finally {
        await handle.close();
      }
      lockHeld = true;
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;

      let lockPid: number | undefined;
      try {
        const rawLock = await fs.readFile(lockPath, 'utf8');
        const parsedLock = JSON.parse(rawLock) as { pid?: unknown };
        if (typeof parsedLock.pid === 'number' && Number.isInteger(parsedLock.pid) && parsedLock.pid > 0) lockPid = parsedLock.pid;
      } catch {
        // A malformed lock has no live owner that can be safely identified and is treated as stale.
      }

      if (lockPid !== undefined && isProcessAlive(lockPid)) {
        throw new Error(`Another UI capture is already running (PID ${lockPid}).`);
      }

      await fs.rm(lockPath, { force: true });
      trace('stale_lock', lockPid ?? 'unreadable');
    }
  }

  throw new Error('Could not acquire the UI capture lock.');
}

async function reservePort() {
  return new Promise<number>((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = probe.address();
      if (typeof address === 'string' || address === null) {
        probe.close(() => reject(new Error('Could not reserve a TCP port for UI capture.')));
        return;
      }
      const { port } = address;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) throw new Error('The UI capture server exited before it became ready.');
    try {
      const response = await fetch(baseUrl);
      if (response.ok || response.status === 307) return;
    } catch {
      // The isolated Next.js server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('The UI capture server did not start within 60 seconds.');
}

async function capture(page: Page, filename: string, route: string) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'commit', timeout: 15_000 });
  await page.locator('main').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(stagingDir, filename), fullPage: true });
}

async function publishScreenshots() {
  for (const filename of screenshots) {
    const stagedPath = path.join(stagingDir, filename);
    const metadata = await fs.stat(stagedPath);
    if (metadata.size <= 0) throw new Error(`Screenshot ${filename} is empty.`);
  }

  for (const filename of screenshots) {
    await fs.rename(path.join(stagingDir, filename), path.join(outputDir, filename));
  }
}

async function waitForChildExit(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function terminateServerTree() {
  const currentServer = server;
  server = undefined;
  if (!currentServer?.pid || currentServer.exitCode !== null || currentServer.signalCode !== null) return;

  currentServer.kill('SIGTERM');
  if (await waitForChildExit(currentServer, 5_000)) return;

  if (process.platform === 'win32') {
    await new Promise<void>((resolve, reject) => {
      const taskkill = spawn('taskkill', ['/pid', String(currentServer.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      taskkill.once('error', reject);
      taskkill.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Failed to stop capture server tree (taskkill exit ${code ?? 'unknown'}).`)));
    });
    if (await waitForChildExit(currentServer, 2_000)) return;
    throw new Error('Capture server root remained active after its exact process tree was stopped.');
  }

  currentServer.kill('SIGKILL');
  if (!await waitForChildExit(currentServer, 2_000)) throw new Error('Capture server did not exit.');
}

async function closeBrowser() {
  const currentBrowser = browser;
  browser = undefined;
  if (currentBrowser) await currentBrowser.close();
}

async function restoreNextEnv() {
  if (!originalNextEnv) return;
  const currentNextEnv = await fs.readFile(nextEnvPath);
  if (currentNextEnv.equals(originalNextEnv)) return;
  if (captureNextEnv && currentNextEnv.equals(captureNextEnv)) {
    await fs.writeFile(nextEnvPath, originalNextEnv);
    return;
  }
  throw new Error('next-env.d.ts changed outside this capture run; it was preserved instead of overwritten.');
}

async function cleanup(reason: string) {
  if (cleanupTask) return cleanupTask;

  cleanupTask = (async () => {
    const outcomes: string[] = [];
    const attempt = async (label: string, operation: () => Promise<void>) => {
      try {
        await operation();
        outcomes.push(`${label}:ok`);
      } catch (error) {
        cleanupProblems.push(label);
        outcomes.push(`${label}:failed`);
        trace(`${label}_error`, error instanceof Error ? error.message : 'unknown');
      }
    };

    await attempt('browser', closeBrowser);
    await attempt('server_tree', terminateServerTree);
    await attempt('next_env', restoreNextEnv);
    await attempt('staging_dir', () => fs.rm(stagingDir, { recursive: true, force: true }));
    await attempt('build_dir', () => fs.rm(nextDistDir, { recursive: true, force: true }));
    await attempt('temporary_tsconfig', () => fs.rm(temporaryTsconfigPath, { force: true }));
    if (lockHeld) await attempt('lock', () => fs.rm(lockPath, { force: true }));
    trace('cleanup', `${reason};${outcomes.join(',')}`);
  })();

  return cleanupTask;
}

function handleSignal(signal: 'SIGINT' | 'SIGTERM') {
  trace('signal', signal);
  void cleanup(signal).finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
}

process.once('SIGINT', () => handleSignal('SIGINT'));
process.once('SIGTERM', () => handleSignal('SIGTERM'));

async function main() {
  let completed = false;
  try {
    await fs.access(demoDatabase);
    originalNextEnv = await fs.readFile(nextEnvPath);
    await acquireCaptureLock();
    await fs.mkdir(stagingDir, { recursive: true });
    await fs.rm(nextDistDir, { recursive: true, force: true });
    await fs.writeFile(temporaryTsconfigPath, JSON.stringify({
      extends: './tsconfig.json',
      include: ['**/*.ts', '**/*.tsx', `${relativeToRoot(nextDistDir)}/types/**/*.ts`, 'next-env.d.ts', 'prisma/*.ts'],
      exclude: ['node_modules', 'migrations', '.next-validation', '.next-ui-capture-*']
    }, null, 2));

    const port = await reservePort();
    baseUrl = `http://127.0.0.1:${port}`;
    trace('pid', process.pid);
    trace('port', port);
    trace('build_dir', relativeToRoot(nextDistDir));
    const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
    server = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: root,
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        APP_DATABASE_URL: 'file:../data/demo-device-monitor.db',
        APP_TIMEZONE: 'Asia/Shanghai',
        NEXT_DIST_DIR: path.basename(nextDistDir),
        NEXT_TSCONFIG_PATH: path.basename(temporaryTsconfigPath)
      }
    });

    await waitForServer();
    captureNextEnv = await fs.readFile(nextEnvPath);
    const { chromium } = await import('@playwright/test');
    browser = await chromium.launch();
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });

    await capture(desktop, 'desktop-ct-main.png', '/devices/DEMO-CT-ONLINE-001');
    await desktop.getByRole('button', { name: /A\s*.*CT/ }).click();
    await desktop.screenshot({ path: path.join(stagingDir, 'desktop-phase-history-dialog.png'), fullPage: true });
    await desktop.close({ runBeforeUnload: false });

    const desktopGrid = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await capture(desktopGrid, 'desktop-inverter-grid.png', '/devices/DEMO-CT-ONLINE-001');
    await desktopGrid.getByRole('button', { name: /PV1/ }).first().click();
    await desktopGrid.screenshot({ path: path.join(stagingDir, 'desktop-inverter-metric-dialog.png'), fullPage: true });
    await desktopGrid.close({ runBeforeUnload: false });

    const desktopOffline = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await capture(desktopOffline, 'desktop-inverter-offline-history.png', '/devices/DEMO-CT-ONLINE-001/inverters/3');
    await desktopOffline.close();
    const desktopReverse = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await capture(desktopReverse, 'desktop-reverse-flow-alerts.png', '/devices/DEMO-CT-REVERSE-003');
    await desktopReverse.close();

    await capture(mobile, 'mobile-ct-main.png', '/devices/DEMO-CT-ONLINE-001');
    await capture(mobile, 'mobile-inverter-grid.png', '/devices/DEMO-CT-ONLINE-001');
    await mobile.getByRole('button', { name: /PV1/ }).first().click();
    await mobile.screenshot({ path: path.join(stagingDir, 'mobile-metric-dialog.png'), fullPage: true });
    await closeBrowser();
    await publishScreenshots();
    trace('screenshot_count', screenshots.length);
    trace('result', 'success');
    completed = true;
  } finally {
    await cleanup(completed ? 'success' : 'failure');
  }

  if (cleanupProblems.length) throw new Error(`UI capture cleanup failed: ${cleanupProblems.join(', ')}.`);
}

void main().catch((error) => {
  trace('result', 'failure');
  trace('failure_reason', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
});
