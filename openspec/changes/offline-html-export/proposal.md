## Why

工程、售后与运维需要在无 Next.js 服务、无数据库、无网络的环境下审阅防逆流 CT/微逆运行态势。仓库已有动态 Web MVP 与 Demo 数据，但缺少可双击打开的离线 HTML 快照能力，导致验收与外发依赖在线环境。

## What Changes

- 新增离线 HTML 导出 CLI：支持从 SQLite、Demo seed、Excel（经临时库）生成产物。
- 新增单设备自包含单文件 HTML（内嵌 CSS/JS/ECharts/数据，无 CDN、无 `fetch`）。
- 新增多设备离线 Bundle（相对路径互跳）与 ZIP 打包。
- 新增共享 Offline ViewModel 构建层，复用现有 `DeviceService` / `TelemetryService` / domain 规则，不复制业务语义。
- 新增单元、集成与 Playwright `file://` 离线测试（含无网络拦截）及导出指南/验收报告文档。
- 更新 README 与阶段文档，将离线 HTML 快照标记为已实现。

## Capabilities

### New Capabilities

- `offline-html-export`：自包含/Bundle 离线 UI 导出、CLI 编排、离线图表交互与验收约束。

### Modified Capabilities

- （无）当前 `openspec/specs/` 尚无既有 capability 需改写需求级行为。

## Impact

- 新增：`src/export/offline/**`、`scripts/export-offline-html.ts`、相关测试与文档。
- 复用：`src/services/device-service.ts`、`telemetry-service.ts`、`src/domain/*`、既有 `demo:seed` / Excel 导入路径。
- 产物目录：`artifacts/offline-ui/`（gitignore，不提交生成物与真实数据）。
- 依赖：内嵌读取本地 `echarts.min.js`；不新增 CDN；不连接公司库；不改变控制/OTA/MQTT 边界。
- 建议实现基线分支：`origin/codex/phase2-ui-acceptance`（含 Demo 与 UI 语义），功能分支 `codex/offline-html-export`。
