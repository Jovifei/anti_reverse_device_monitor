## Why

`/devices` 页面当前只能展示 12 台 CT，原因是 `DeviceService` 关联了 Mongo 监控库，而该库只保留 7 天窗口。上一轮已通过 IoT 平台 `getDevices` 接口把 372 台「防逆流 CT」注册表写入 `config/devices.json`（含 SN ↔ device_id ↔ nickname 三元映射），但页面没有把这 372 台作为全集展示，导致 360 台「7 日以上离线」设备在 UI 上完全不可见；同时 IoT 同步目前只能手动触发，没接日级调度。

需要让 IoT 注册表成为页面数据源的全集，按「近 7 日上线」与「7 日以上离线」分类呈现，并通过每日 0:00 自动同步保持注册表新鲜度。

## What Changes

- **DeviceService 扩展**：以 IoT 注册表（372 台）为权威全集，与 Mongo 监控数据 join 后按 `lastReportedAt` 分类为「近 7 日上线 / 7 日以上离线」。分类口径：监控 DB 有最近 7 天上报时间 **或** IoT `online=true` 即视为上线。
- **/devices 页面新增 KPI 卡**：在现有 6 张 KPI 卡之后增加「7 日以上离线」卡（值 = IoT 注册表总数 − 近 7 日上线数），可点击进入筛选视图，列出所有无近期数据的设备。
- **新增筛选入口**：URL `?status=stale-offline` 路由到 7 日以上离线设备列表。
- **新增 Next.js cron 路由** `/api/cron/sync-iot`：提供 HTTP 端点执行 `npm run devices:sync-iot`，需要 `Authorization: Bearer ${CRON_SECRET}` 鉴权。
- **WorkBuddy automation 调度**：创建一条 daily rrule 自动化，0:00 调用该路由（带 Bearer 鉴权）。
- **README 更新**：补充「定时同步」与「CRON_SECRET 配置」小节。

## Capabilities

### New Capabilities

- `iot-device-registry`：IoT 注册表数据模型、近 7 日上线 / 7 日以上离线分类逻辑、`/devices` 页面 7 日以上离线 KPI 与筛选视图。该 capability 包含数据分类、视图呈现两部分。
- `iot-sync-schedule`：每日 0:00 自动同步能力。包含 Next.js cron 路由、WorkBuddy automation 调度、CRON_SECRET 鉴权、调度失败告警与日志。

### Modified Capabilities

无（仓库当前 `openspec/specs/` 为空，没有现存 spec 需要修改需求级行为）。

## Impact

- 受影响代码：
  - `src/services/device-service.ts`：新增 `lastReportedAt` 字段（7 日分类依据）、`staleOfflineCount` 计数、新分类查询逻辑
  - `src/adapters/source-db/device-registry.ts`：注册表（已含 `nickname`/`online`，无需改 schema；确认 merge 函数兼容 IoT 平台返回的 372 台）
  - `app/devices/page.tsx`：新增 KPI 卡 + `stale-offline` 筛选值
  - `app/api/cron/sync-iot/route.ts`：新增 cron 路由
  - `package.json`：加 `cron:sync-iot` 脚本
  - `config/.env.local.example`、`config.txt`：加 `CRON_SECRET` 占位
  - `README.md`：补「定时同步」与 CRON_SECRET 配置说明
- 受影响数据：
  - `config/devices.json`：每日 0:00 由 automation 刷新（保持 372 台；带 `label` 的人工 Excel 项保留）
  - Mongo 监控库：只读，不动
- 外部依赖：
  - 造梦者 IoT 平台 API：被 automation 每日调用
  - WorkBuddy automation 服务：需可用（已确认 `automation_update` 工具已连接）
- 风险与回滚：
  - 同步失败时 `config/devices.json` 保持上次成功状态，automation 日志留痕；可手动 `npm run devices:sync-iot` 重跑
  - 7 日分类首次上线时，原 12 台 GC2001000 SN 与 372 台 IoT SN 是不同设备集，需确认页面正确并集展示而非替换
  - 鉴权：`CRON_SECRET` 缺失时 cron 路由直接 503；automation 同步失败会重试 3 次后退避
