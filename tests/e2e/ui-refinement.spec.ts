import { expect, test } from '@playwright/test';

test.describe('CT and inverter monitoring refinements', () => {
  test('shows operational header, read-only source label, and three core power series', async ({ page }) => {
    await page.goto('/devices/DEMO-CT-ONLINE-001');

    await expect(page.getByText('CT 当前状态')).toBeVisible();
    await expect(page.getByText('电网与三相 CT 质量')).toBeVisible();
    await expect(page.getByText(/数据来源：/)).toBeVisible();
    await expect(page.getByText('防逆流运行正常')).toBeVisible();
    await expect(page.getByText('功率总览')).toBeVisible();
    await expect(page.getByLabel('家庭负载功率')).toBeChecked();
    await expect(page.getByLabel('电网功率')).toBeChecked();
    await expect(page.getByLabel('微逆发电总功率')).toBeChecked();
  });

  test('opens phase and inverter metric history dialogs', async ({ page }) => {
    await page.goto('/devices/DEMO-CT-ONLINE-001');

    await page.getByRole('button', { name: '查看A 相 CT 有功功率历史曲线' }).click();
    await expect(page.getByRole('dialog', { name: 'A 相 CT 有功功率历史' })).toBeVisible();
    await page.getByRole('button', { name: '关闭历史曲线' }).click();

    await page.getByRole('button', { name: '查看PV1 功率历史曲线' }).first().click();
    await expect(page.getByRole('dialog', { name: /PV1 功率历史/ })).toBeVisible();
    await page.getByRole('button', { name: '关闭历史曲线' }).click();
  });

  test('keeps all eight inverter states distinct and surfaces Chinese fault names', async ({ page }) => {
    await page.goto('/devices/DEMO-CT-ONLINE-001');
    await expect(page.getByText('微型逆变器 1～8')).toBeVisible();
    await expect(page.getByText('未配对通道')).toBeVisible();
    await expect(page.getByText('暂无遥测数据')).toBeVisible();

    await page.goto('/devices/DEMO-CT-REVERSE-003/inverters/1');
    await expect(page.getByText('PV1 输入欠压', { exact: true })).toBeVisible();
    await expect(page.getByText('PV2 输入欠压', { exact: true })).toBeVisible();
    await expect(page.getByText('PV 电压异常', { exact: true })).toBeVisible();
    await expect(page.getByText('undefined')).toHaveCount(0);
    await expect(page.getByText('NaN')).toHaveCount(0);
  });

  test('shows a severe reverse-flow banner and offline interval history', async ({ page }) => {
    await page.goto('/devices/DEMO-CT-REVERSE-003');
    await expect(page.getByText('严重告警：检测到功率反送电网')).toBeVisible();
    await expect(page.getByText('最近 7 天逆流告警记录')).toBeVisible();

    await page.goto('/devices/DEMO-CT-ONLINE-001/inverters/3');
    await expect(page.getByText('在线和离线记录')).toBeVisible();
    await expect(page.getByText('离线区间')).toBeVisible();
  });
});
