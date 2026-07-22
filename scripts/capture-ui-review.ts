import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

process.env.PLAYWRIGHT_BROWSERS_PATH ??= 'E:\\Claude_allow\\Download\\playwright-browsers'

const root = process.cwd()
const outputDir = path.join(root, 'artifacts', 'ui-review')
const demoDatabase = path.join(root, 'data', 'demo-device-monitor.db')
const baseUrl = 'http://127.0.0.1:3102'

async function waitForServer() {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok || response.status === 307) return
    } catch {
      // The development server has not bound the port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('截图服务未能在 60 秒内启动。')
}

async function main() {
  try {
    await fs.access(demoDatabase)
  } catch {
    throw new Error('未找到 Demo 数据库，请先执行 npm run demo:seed。')
  }
  await fs.mkdir(outputDir, { recursive: true })

  const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
  const server = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', '3102'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, APP_DATABASE_URL: 'file:../data/demo-device-monitor.db', APP_TIMEZONE: 'Asia/Shanghai' }
  })

  try {
    await waitForServer()
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch()
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true })
    const desktopShots = [
      ['desktop-device-overview.png', '/devices'],
      ['desktop-ct-online.png', '/devices/DEMO-CT-ONLINE-001'],
      ['desktop-ct-offline.png', '/devices/DEMO-CT-OFFLINE-002'],
      ['desktop-ct-reverse-flow.png', '/devices/DEMO-CT-REVERSE-003'],
      ['desktop-inverter-online.png', '/devices/DEMO-CT-ONLINE-001/inverters/1'],
      ['desktop-inverter-offline.png', '/devices/DEMO-CT-ONLINE-001/inverters/3'],
      ['desktop-inverter-fault.png', '/devices/DEMO-CT-REVERSE-003/inverters/1']
    ] as const
    const mobileShots = [
      ['mobile-device-overview.png', '/devices'],
      ['mobile-ct-detail.png', '/devices/DEMO-CT-REVERSE-003'],
      ['mobile-inverter-detail.png', '/devices/DEMO-CT-REVERSE-003/inverters/1']
    ] as const
    for (const [filename, route] of desktopShots) {
      await desktop.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' })
      await desktop.waitForTimeout(500)
      await desktop.screenshot({ path: path.join(outputDir, filename), fullPage: true })
    }
    for (const [filename, route] of mobileShots) {
      await mobile.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' })
      await mobile.waitForTimeout(500)
      await mobile.screenshot({ path: path.join(outputDir, filename), fullPage: true })
    }
    await browser.close()
    console.log(`已生成 ${desktopShots.length + mobileShots.length} 张验收截图：${outputDir}`)
  } finally {
    server.kill()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
