import { expect, test } from '@playwright/test';

test('overview keeps online, offline, and reverse-flow CT scenarios', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/devices$/);
  await expect(page.getByRole('heading', { name: '防逆流设备运行总览' })).toBeVisible();
  await expect(page.locator('.offline-row')).toBeVisible();
  await expect(page.locator('.reverse-row')).toBeVisible();
});

test('CT detail renders dynamic status, source label, and default power curves', async ({ page }) => {
  await page.goto('/devices/DEMO-CT-ONLINE-001');
  await expect(page.getByRole('heading', { name: /设备 SN：DEMO-CT-ONLINE-001/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CT 当前状态' })).toBeVisible();
  await expect(page.getByText(/数据来源：/)).toBeVisible();
  await expect(page.getByRole('heading', { name: '功率总览' })).toBeVisible();
  await expect(page.getByLabel('范围').first()).toHaveValue('7');
  await expect(page.getByRole('button', { name: '复位缩放' }).first()).toBeVisible();
  await expect(page.locator('.inverter-card')).toHaveCount(8);
});

test('reverse phases, history dialog, and decoded fault names are readable', async ({ page }) => {
  await page.goto('/devices/DEMO-CT-REVERSE-003');
  await expect(page.getByText('严重告警：检测到功率反送电网')).toBeVisible();
  await expect(page.getByRole('button', { name: '查看A 相 CT 有功功率历史曲线' })).toContainText('A 相 CT 有功功率');
  await expect(page.getByRole('button', { name: '查看C 相 CT 有功功率历史曲线' })).toContainText('C 相 CT 有功功率');
  await page.getByRole('button', { name: '查看A 相 CT 有功功率历史曲线' }).click();
  await expect(page.getByRole('dialog', { name: 'A 相 CT 有功功率历史' })).toBeVisible();
  await page.getByRole('button', { name: '关闭历史曲线' }).click();
  await page.goto('/devices/DEMO-CT-REVERSE-003/inverters/1');
  await expect(page.getByText('PV1 输入欠压', { exact: true })).toBeVisible();
  await expect(page.getByText('PV2 输入欠压', { exact: true })).toBeVisible();
  await expect(page.getByText('PV 电压异常', { exact: true })).toBeVisible();
});

test('inverter detail presents state, offline interval, and no-fault state without placeholders', async ({ page }) => {
  await page.goto('/devices/DEMO-CT-ONLINE-001');
  await expect(page.locator('.inverter-card.online').first()).toBeVisible();
  await expect(page.locator('.inverter-card.offline')).toContainText('微型逆变器 3');
  await expect(page.locator('.inverter-card.unpaired')).toContainText('未配对通道');
  await expect(page.locator('.inverter-card.unknown')).toContainText('暂无遥测数据');
  await page.locator('.inverter-card').filter({ hasText: '微型逆变器 1' }).getByRole('link', { name: '查看详情' }).click();
  await expect(page.getByRole('heading', { name: /微型逆变器 1：DEMO-MI-A01/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: '在线和离线记录' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '离线区间' })).toBeVisible();
  await expect(page.getByText('当前无故障')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('undefined');
  await expect(page.locator('body')).not.toContainText('null');
});
