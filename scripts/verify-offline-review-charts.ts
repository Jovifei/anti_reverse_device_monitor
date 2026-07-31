import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import { chartSeriesDisplayColor, NEGATIVE_POWER_ALERT_COLOR } from '@/src/domain/monitoring'
import { extractEmbeddedOfflineViewModel } from '@/src/export/offline/embedded-view-model'
import type { OfflineDeviceViewModel } from '@/src/export/offline/types'

function reviewDirectory(argv: string[]) {
  const index = argv.indexOf('--dir')
  const value = index >= 0 ? argv[index + 1] : undefined
  if (!value || value.startsWith('--')) throw new Error('必须指定 --dir <离线审核目录>。')
  return path.resolve(value)
}

function hasNegativePower(vm: OfflineDeviceViewModel, phaseIndex: number) {
  return (vm.phases[phaseIndex]?.series || []).some((series) => series.points.some(([, value]) => typeof value === 'number' && value < 0))
}

async function main() {
  const dir = reviewDirectory(process.argv.slice(2))
  const entries = (await fs.readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^device-.*\.html$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
  if (!entries.length) throw new Error('审核目录中没有设备 HTML 页面。')

  const browser = await chromium.launch({ headless: true })
  let phaseChecks = 0
  try {
    for (const fileName of entries) {
      const filePath = path.join(dir, fileName)
      const vm = extractEmbeddedOfflineViewModel(await fs.readFile(filePath, 'utf8'))
      if (vm.kind !== 'device') throw new Error(`${fileName} 不是设备页面。`)
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      try {
        await page.goto(pathToFileURL(filePath).href, { waitUntil: 'domcontentloaded' })
        const cards = page.locator('.phase-card')
        if (await cards.count() !== vm.phases.length) throw new Error(`${fileName} 的相位卡片数量不一致。`)

        for (let index = 0; index < vm.phases.length; index += 1) {
          const phase = vm.phases[index]
          const renderableSeries = (phase?.series || []).filter((series) => series.points.length > 0)
          const expectedColors = renderableSeries.map((series) => chartSeriesDisplayColor(series.key, series.color))
          const negative = hasNegativePower(vm, index)
          await cards.nth(index).click()
          await page.waitForSelector('.dialog .chart-host')
          const optionJson = await page.evaluate(() => {
            const api = (window as unknown as { echarts?: { getInstanceByDom: (node: Element) => { getOption: () => { series?: unknown[] } } | undefined } }).echarts
            const host = document.querySelector('.dialog .chart-host')
            return api && host ? JSON.stringify(api.getInstanceByDom(host)?.getOption().series ?? []) : ''
          })
          if (!optionJson) throw new Error(`${fileName} ${phase?.phase ?? index} 相图表未初始化。`)
          for (const color of expectedColors) {
            if (!optionJson.includes(`"color":"${color}"`)) throw new Error(`${fileName} ${phase?.phase ?? index} 相未使用规范色 ${color}。`)
          }
          if (negative !== optionJson.includes(NEGATIVE_POWER_ALERT_COLOR)) {
            throw new Error(`${fileName} ${phase?.phase ?? index} 相的红色逆流层与负功率数据不一致。`)
          }
          await page.locator('.dialog-close').click()
          phaseChecks += 1
        }
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }

  console.log(JSON.stringify({ status: 'pass', devicePages: entries.length, phaseChecks }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
