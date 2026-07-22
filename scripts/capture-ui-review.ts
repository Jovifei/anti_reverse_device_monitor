import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= 'E:\\Claude_allow\\Download\\playwright-browsers';

const root = process.cwd();
const outputDir = path.join(root, 'artifacts', 'ui-review');
const demoDatabase = path.join(root, 'data', 'demo-device-monitor.db');
const baseUrl = 'http://127.0.0.1:3102';

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok || response.status === 307) return;
    } catch {
      // The development server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Screenshot server did not start within 60 seconds.');
}

async function capture(page: import('@playwright/test').Page, filename: string, route: string) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'commit', timeout: 15_000 });
  await page.locator('main').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outputDir, filename), fullPage: true });
}

async function main() {
  await fs.access(demoDatabase);
  await fs.mkdir(outputDir, { recursive: true });
  const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  const server = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', '3102'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, APP_DATABASE_URL: 'file:../data/demo-device-monitor.db', APP_TIMEZONE: 'Asia/Shanghai' },
  });

  try {
    await waitForServer();
    const { chromium } = await import('@playwright/test');
    const browser = await chromium.launch();
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });

    await capture(desktop, 'desktop-ct-main.png', '/devices/DEMO-CT-ONLINE-001');
    await desktop.getByRole('button', { name: '查看A 相 CT 有功功率历史曲线' }).click();
    await desktop.screenshot({ path: path.join(outputDir, 'desktop-phase-history-dialog.png'), fullPage: true });
    await desktop.close({ runBeforeUnload: false });

    const desktopGrid = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await capture(desktopGrid, 'desktop-inverter-grid.png', '/devices/DEMO-CT-ONLINE-001');
    await desktopGrid.getByRole('button', { name: '查看PV1 功率历史曲线' }).first().click();
    await desktopGrid.screenshot({ path: path.join(outputDir, 'desktop-inverter-metric-dialog.png'), fullPage: true });
    await desktopGrid.close({ runBeforeUnload: false });

    const desktopOffline = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await capture(desktopOffline, 'desktop-inverter-offline-history.png', '/devices/DEMO-CT-ONLINE-001/inverters/3');
    await desktopOffline.close();
    const desktopReverse = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await capture(desktopReverse, 'desktop-reverse-flow-alerts.png', '/devices/DEMO-CT-REVERSE-003');
    await desktopReverse.close();

    await capture(mobile, 'mobile-ct-main.png', '/devices/DEMO-CT-ONLINE-001');
    await capture(mobile, 'mobile-inverter-grid.png', '/devices/DEMO-CT-ONLINE-001');
    await mobile.getByRole('button', { name: '查看PV1 功率历史曲线' }).first().click();
    await mobile.screenshot({ path: path.join(outputDir, 'mobile-metric-dialog.png'), fullPage: true });
    await browser.close();
    console.log(`Generated 9 UI acceptance screenshots in ${outputDir}`);
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
