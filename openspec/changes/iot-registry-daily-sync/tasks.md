## 1. 注册表数据层：7 日分类 view-model

- [ ] 1.1 在 `src/services/device-service.ts` 的 `DeviceListResponse.items` 上新增 `classifyStatus: 'active' | 'recent-offline' | 'stale-offline'` 字段，并在 `listDevices()` 里计算：基于 `isOnline` (Mongo 7 日) 与 IoT `online` 字段的 OR 逻辑；7 日以上无数据 + IoT offline → `stale-offline`；监控有近期数据但当前不在线 → `recent-offline`；当前在线 → `active`
- [ ] 1.2 在 `DeviceListResponse.summary` 里加 `staleOfflineCount`（从分类结果统计）、`recentOfflineCount`、`registryTotal`（IoT 注册表总条数，不受 join 影响）
- [ ] 1.3 验证 `npm run dev` 跑 `/devices` 不带筛选时 `result.items.length === 372`、`result.summary.registryTotal === 372`

## 2. 页面层：7 日以上离线 KPI 卡与筛选

- [ ] 2.1 `app/devices/page.tsx` 在 `fleet-status-tabs` 数组加 `{ value: 'stale-offline', label: '7 日以上离线' }`，并加进 FILTERS
- [ ] 2.2 在 KPI 网格（`fleet-priority-grid`）末尾加一张「7 日以上离线」KPI 卡，链接到 `?status=stale-offline`，值 = `result.summary.staleOfflineCount`，副文案「N 台 IoT 设备 7 日以上无上报数据 · 点击筛选」
- [ ] 2.3 表格渲染：当 `status === 'stale-offline'` 时，行为加 `stale-offline-row` class；SN/最后上报/在线状态徽标按 spec 渲染（无近期数据显示 "—"）
- [ ] 2.4 视觉差异：新增 `.stale-offline-row` CSS（淡灰色行 + 弱化字体），与活跃设备区分
- [ ] 2.5 验证：手动访问 `/devices?status=stale-offline` 看到约 360 行；KPI 卡点击进入后正确显示

## 3. Cron 路由层

- [ ] 3.1 新建 `app/api/cron/sync-iot/route.ts`，导出 `POST` handler：检查 `Authorization: Bearer ${process.env.CRON_SECRET}`（constant-time 比较），缺失/错误返 401；`CRON_SECRET` 未配置返 503；用 `child_process.execFile` 跑 `npm run devices:sync-iot`（cwd = 项目根），超时 120s
- [ ] 3.2 handler 返回 JSON：成功 `{status: 'ok', total, added, updated, removed, pages, durationMs, output, warnings}`；失败 `{status: 'error', error, stderr: string[0..500]}`，HTTP 500
- [ ] 3.3 加 `GET` handler 返 405
- [ ] 3.4 server 日志打印 `iot sync: status=ok|error total=N added=A updated=U removed=R durationMs=MS`
- [ ] 3.5 在 `package.json` 加 `cron:sync-iot` 脚本：`node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/sync-iot-device-registry.ts`，让路由直接 exec 不带 npm wrapper

## 4. 配置与文档

- [ ] 4.1 `config/.env.local.example` 与 `config.txt` 加 `CRON_SECRET=<openssl-rand-hex-32>` 占位
- [ ] 4.2 README 加「定时同步」小节：如何生成 `CRON_SECRET`、如何用 `curl` 手动触发、如何验证 automation 在跑
- [ ] 4.3 `.workbuddy/automation/<id>.json`（如不存在则自动创建）记录 automation 配置

## 5. 调度层：WorkBuddy automation

- [ ] 5.1 用 `automation_update --mode create` 创建 daily automation：name=`iot-registry-daily-sync`，rrule=`FREQ=DAILY;BYHOUR=0;BYMINUTE=0`，cwd=`D:\work\anti_reverse_device_monitor`，prompt 包含 `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-iot`
- [ ] 5.2 验证：`automation_update --mode list` 看到新 automation status=ACTIVE
- [ ] 5.3 用 `automation_update --mode update --id <id> --status PAUSED` 临时停掉一次，手动 `curl` 调路由验证 200 与 503/401/500 行为，再恢复 ACTIVE

## 6. 测试与回归

- [ ] 6.1 `npx tsc --noEmit` 0 新增错误（仓库有 15 个预存错误，忽略）
- [ ] 6.2 `npx eslint app/api/cron app/devices src/services` 0 告警
- [ ] 6.3 `npm run devices:sync-iot -- --dry-run` 仍可用，未破坏上一轮功能
- [ ] 6.4 真实 `npm run devices:sync-iot` 跑一遍，确认 `config/devices.json` 仍 372 台、JSON 报告符合 spec
- [ ] 6.5 真实 `curl` 调 cron 路由（带 `CRON_SECRET`），验证返回 JSON 与 200
- [ ] 6.6 `npm run dev` 浏览器打开 `/devices?status=stale-offline` 看到约 360 行 7 日以上离线设备

## 7. 提交与发布

- [ ] 7.1 暂存：`git add` 只加本 change 涉及文件（不碰 `.env.local`、`.workbuddy/`、临时产物）
- [ ] 7.2 提交：`git commit -m "feat: 7 日上线/离线分类 + 每日 0:00 自动同步"`
- [ ] 7.3 推送：`git push origin main`
- [ ] 7.4 记录到 `.workbuddy/memory/2026-08-07.md`：change 名、关键决策、automation id
