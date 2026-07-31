import { expect, test } from '@playwright/test'

test('overview keeps online, offline, and reverse-flow CT scenarios', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/devices$/)
  await expect(page.locator('.fleet-risk-table tbody tr.offline-row')).toBeVisible()
  await expect(page.locator('.fleet-risk-table tbody tr.reverse-row')).toBeVisible()
  await expect(page.locator('.fleet-risk-table tbody tr')).toHaveCount(3)
})

test('inverter detail presents units, switches, duration, and decoded faults', async ({ page }) => {
  await page.goto('/devices/DEMO-CT-ONLINE-001/inverters/1')
  await expect(page.getByText('当前状态持续：', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('防逆流开关').locator('..')).toContainText('开启')
  await expect(page.getByText('发电开关').locator('..')).toContainText('开启')
  await expect(page.getByText('功率限制').locator('..')).toContainText('100 W')
  await expect(page.getByText('PV1 输入欠压', { exact: true })).not.toBeVisible()
  await expect(page.locator('body')).not.toContainText('undefined')
  await expect(page.locator('body')).not.toContainText('null')
})
