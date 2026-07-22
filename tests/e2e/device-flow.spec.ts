import { expect, test } from '@playwright/test'

test('SN suffix lookup opens the CT dashboard and an inverter detail page', async ({ page }) => {
  await page.goto('/devices/252')
  await expect(page.getByRole('heading', { name: /设备 SN：GC2001000000252/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: '功率总览' })).toBeVisible()
  await Promise.all([
    page.waitForURL('**/devices/GC2001000000252/inverters/1'),
    page.getByRole('link', { name: '查看微逆 1 详情' }).click()
  ])
  await expect(page.getByRole('heading', { name: /微型逆变器 1：MI-0001/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: '内部温度曲线' })).toBeVisible()
})
