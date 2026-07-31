import { expect, test } from '@playwright/test'

test.describe('CT and inverter monitoring refinements', () => {
  test('keeps the demo summary stable and labels the read-only source', async ({ page }) => {
    await page.goto('/devices')
    await expect(page.locator('.fleet-priority-card.critical strong')).toHaveText('1')
    await expect(page.locator('.fleet-priority-card.warning strong')).toHaveText('1')
    await expect(page.locator('.fleet-priority-card.online strong')).toHaveText('2 / 3')
    await expect(page.locator('.fleet-risk-table tbody tr.reverse-row')).toContainText('严重逆流')
    await expect(page.locator('.fleet-risk-table tbody tr.offline-row')).toContainText('离线')
    await expect(page.locator('.fleet-risk-table thead')).toContainText('今日发电量')
    await expect(page.locator('.fleet-risk-table thead')).toContainText('Sub1G')
    await expect(page.locator('.fleet-risk-table thead')).toContainText('WiFi 信号')
    await expect(page.locator('.fleet-risk-table')).not.toContainText('型号')

    await page.goto('/devices/DEMO-CT-ONLINE-001')
    await expect(page.getByText('数据来源：Demo SQLite')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'CT 当前状态' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '电网电压与频率（V / Hz）' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '功率总览' })).toBeVisible()
    await expect(page.getByText('更多曲线')).toBeVisible()
    await expect(page.locator('.inverter-card')).toHaveCount(8)
  })

  test('keeps reverse-flow totals physically explainable and phase cards severe-first', async ({ page }) => {
    await page.goto('/devices/DEMO-CT-REVERSE-003')
    await expect(page.getByText('严重告警：检测到功率反送电网')).toBeVisible()
    await expect(page.getByText('最近 7 天逆流告警记录')).toBeVisible()
    await expect(page.getByText('-420 W').first()).toBeVisible()
    await expect(page.getByText('-160 W')).toBeVisible()
    await expect(page.getByText('-260 W').first()).toBeVisible()
    await expect(page.getByText('查看 7 天曲线').first()).toBeVisible()
  })

  test('uses real-time power for generating state and preserves all eight inverter states', async ({ page }) => {
    await page.goto('/devices/DEMO-CT-ONLINE-001')
    await expect(page.locator('.inverter-card')).toHaveCount(8)
    await expect(page.locator('.inverter-card.online').first().locator('.inverter-state-grid')).toContainText('正在发电')
    await expect(page.locator('.inverter-card.online').nth(1)).toContainText('否')
    await expect(page.locator('.inverter-card.online').nth(1)).toContainText('0 W')
    await expect(page.locator('.inverter-card.offline')).toContainText('—')
    await expect(page.locator('.inverter-card.unpaired')).toContainText('未配对通道')
    await expect(page.locator('.inv-gen-banner')).toHaveCount(0)
    await expect(page.locator('.gen-spotlight')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('undefined')
    await expect(page.locator('body')).not.toContainText('null')
    await expect(page.locator('body')).not.toContainText('NaN')
  })

  test('marks offline CT values as last known', async ({ page }) => {
    await page.goto('/devices/DEMO-CT-OFFLINE-002')
    await expect(page.getByText('当前离线，以下状态和指标均为最后已知值')).toBeVisible()
    await expect(page.getByText('最后已知值').first()).toBeVisible()
    await expect(page.getByText('Sub1G 状态')).toBeVisible()
  })

  test('keeps the CT fleet table inside an internal mobile scroll area', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/devices')
    const dimensions = await page.locator('.fleet-table-scroll').evaluate((node) => ({
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      tableViewportWidth: node.clientWidth,
      tableScrollWidth: node.scrollWidth
    }))
    expect(dimensions.documentScrollWidth).toBe(dimensions.viewportWidth)
    expect(dimensions.tableScrollWidth).toBeGreaterThan(dimensions.tableViewportWidth)
  })

  test('opens desktop and mobile history dialogs without leaking body scroll', async ({ page }) => {
    await page.goto('/devices/DEMO-CT-ONLINE-001')
    await page.locator('.phase-grid .metric-history-trigger').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: '关闭历史曲线' }).click()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(150)
    await page.locator('.inverter-grid .metric-history-trigger').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
    const box = await page.locator('.metric-dialog').boundingBox()
    expect(box?.x).toBe(0)
    expect(box?.y).toBe(0)
    expect(box?.width).toBe(390)
    expect(box?.height).toBe(844)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
  })
})
