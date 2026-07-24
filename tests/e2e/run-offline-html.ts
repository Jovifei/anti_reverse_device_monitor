import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const root = process.cwd()
const outDir = path.join(root, 'artifacts', 'offline-ui')
const reviewDir = path.join(outDir, 'review')

async function run(command: string, args: string[]) {
  const prismaCommand =
    process.platform === 'win32'
      ? { file: 'cmd.exe', args: ['/d', '/s', '/c', [command, ...args].join(' ')] }
      : { file: command, args }
  execFileSync(prismaCommand.file, prismaCommand.args, { cwd: root, env: process.env, stdio: 'inherit' })
}

async function main() {
  await fs.mkdir(reviewDir, { recursive: true })
  await run('npx', ['tsx', 'scripts/export-offline-html.ts', '--demo', '--all', '--bundle', '--single-file', '--out', 'artifacts/offline-ui'])

  const onlineHtml = path.join(outDir, 'demo-device-DEMO-CT-ONLINE-001.html')
  const reverseHtml = path.join(outDir, 'demo-device-DEMO-CT-REVERSE-003.html')
  const indexHtml = path.join(outDir, 'bundle', 'index.html')
  const zipPath = path.join(outDir, 'anti-reverse-device-ui-demo.zip')
  for (const file of [onlineHtml, reverseHtml, indexHtml, zipPath]) {
    await fs.access(file)
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const blocked: string[] = []
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (url.startsWith('http://') || url.startsWith('https://')) {
      blocked.push(url)
      await route.abort()
      return
    }
    await route.continue()
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto(pathToFileURL(onlineHtml).href, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="reverse-safety-panel"]')
  const bodyText = await page.locator('body').innerText()
  if (/undefined|NaN|\bnull\b/i.test(bodyText)) throw new Error('页面出现 undefined/null/NaN')
  await page.screenshot({ path: path.join(reviewDir, 'offline-ct-online.png'), fullPage: true })
  await page.locator('.phase-card').first().click()
  await page.waitForSelector('.dialog')
  await page.screenshot({ path: path.join(reviewDir, 'offline-phase-dialog.png') })
  await page.locator('.dialog-close').click()
  await page.locator('[data-testid="inverter-card-1"] button').first().click()
  await page.waitForSelector('.dialog')
  await page.screenshot({ path: path.join(reviewDir, 'offline-inverter-dialog.png') })
  await page.locator('.dialog-close').click()
  await page.screenshot({ path: path.join(reviewDir, 'offline-inverter-grid.png'), fullPage: true })

  await page.goto(pathToFileURL(reverseHtml).href, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.reverse-safety-panel.is-danger')
  await page.screenshot({ path: path.join(reviewDir, 'offline-ct-reverse.png'), fullPage: true })

  await page.goto(pathToFileURL(indexHtml).href, { waitUntil: 'domcontentloaded' })
  await page.screenshot({ path: path.join(reviewDir, 'offline-overview.png'), fullPage: true })
  await page.locator('a', { hasText: 'CT 面板' }).first().click()
  await page.waitForSelector('[data-testid="reverse-safety-panel"]')
  const detailLink = page.locator('a', { hasText: '打开微逆详情' }).first()
  if (await detailLink.count()) {
    await detailLink.click()
    await page.waitForSelector('text=微型逆变器')
    await page.screenshot({ path: path.join(reviewDir, 'offline-inverter-offline-history.png'), fullPage: true })
    await page.goBack()
  }

  await browser.close()
  if (blocked.length) throw new Error(`检测到网络请求: ${blocked.join(', ')}`)
  if (errors.length) throw new Error(`控制台错误: ${errors.join(' | ')}`)
  console.log(JSON.stringify({ status: 'pass', onlineHtml, zipPath, blockedRequests: blocked.length }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
