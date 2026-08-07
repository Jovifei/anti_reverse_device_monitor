## ADDED Requirements

### Requirement: IoT 注册表是设备全集来源
`DeviceService` MUST 把 `config/devices.json`（造梦者 IoT 平台同步结果，含 372 台 `device_id`/`sn`/`nickname`）作为设备全集来源，与 Mongo 监控数据 join 后输出。

#### Scenario: 全集输出
- **WHEN** 调用 `DeviceService.listDevices()` 不带任何筛选
- **THEN** 返回的设备总数 MUST = IoT 注册表总条数（当前 372），不因监控数据缺失而隐藏任何设备

#### Scenario: 旧 Excel 手工项保留
- **WHEN** IoT 注册表与 `apply-device-sn-map.ts` 写入的人工 `label` 项并存
- **THEN** 合并后 MUST 同时保留两类；带 `label` 的项不参与 IoT `nickname` 覆盖

### Requirement: 近 7 日上线 / 7 日以上离线分类
每台设备 MUST 能被归类为「近 7 日上线」或「7 日以上离线」。分类口径：监控 DB 有 `lastReportedAt` 且距今 ≤ 7 天 **或** IoT 平台 `online=true`（任一为真）= 近 7 日上线；否则 = 7 日以上离线。

#### Scenario: 当前在线设备
- **WHEN** 设备 `isOnline=true` 且 `lastReportedAt` 在 7 天内
- **THEN** 分类 MUST 为「近 7 日上线」

#### Scenario: 监控数据缺失但 IoT 报告在线
- **WHEN** 监控 DB 无 `lastReportedAt`（超出 7 天窗口被清），但 IoT `online=true`
- **THEN** 分类 MUST 仍为「近 7 日上线」

#### Scenario: 7 日以上离线
- **WHEN** 设备 `isOnline=false` 且 `lastReportedAt` 缺失或 > 7 天前
- **THEN** 分类 MUST 为「7 日以上离线」

#### Scenario: 边界值
- **WHEN** `lastReportedAt` 距今 = 7 天 ± 1 分钟
- **THEN** 分类 MUST 落到「近 7 日上线」（边界包含；如需严格 < 7 天，须在设备服务显式注释该口径）

### Requirement: /devices 页面 7 日以上离线 KPI 卡
`/devices` 页面 MUST 在现有 6 张 KPI 卡之后新增一张「7 日以上离线」KPI 卡，值 = `IoT 注册表总数 − 近 7 日上线数`，可点击进入 `?status=stale-offline` 筛选视图。

#### Scenario: 数值正确
- **WHEN** 注册表 372 台、近 7 日上线 12 台
- **THEN** KPI 卡 MUST 显示 360

#### Scenario: 点击进入筛选
- **WHEN** 点击「7 日以上离线」KPI 卡
- **THEN** URL MUST 变为 `/devices?status=stale-offline`，表格 MUST 列出所有 7 日以上离线设备

#### Scenario: 7 日以上离线筛选为空
- **WHEN** IoT 注册表全部近 7 日上线（数量 = 0）
- **THEN** KPI 卡 MUST 显示 0，且筛选视图 MUST 显示空态文案

### Requirement: 7 日以上离线设备表格渲染
7 日以上离线设备 MUST 能在 `/devices` 表格中渲染，至少展示 SN、`nickname`（IoT 平台自定义名）、设备名（若无 nickname）、最后上报时间（"无近期数据"）、详情链接。

#### Scenario: 渲染字段
- **WHEN** 表格包含 7 日以上离线设备
- **THEN** 每行 MUST 包含：CT SN、IoT 设备名、最后上报（显示"—"或"无近期数据"）、在线状态徽标（"IoT 在线"/"IoT 离线"）、详情链接

#### Scenario: 表头与样式
- **WHEN** 7 日以上离线设备在表格中显示
- **THEN** 表头 MUST 与现有「CT 风险与运行概览」一致；行 MUST 使用「7 日以上离线」专用 class（`stale-offline-row`）以与活跃设备视觉区分
