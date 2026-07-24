# Comet Design Handoff

- Change: offline-html-export
- Phase: design
- Mode: compact
- Context hash: 9d2c3f83f8f97df7c58d51e278074118c5bddd5aa20b700b97463f543673a885

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/offline-html-export/proposal.md

- Source: openspec/changes/offline-html-export/proposal.md
- Lines: 1-30
- SHA256: c49cb7aa2c1e9af89ca54b51641cf1ac530a2b83345b0a630f89898ea80539ed

```md
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

```

## openspec/changes/offline-html-export/design.md

- Source: openspec/changes/offline-html-export/design.md
- Lines: 1-60
- SHA256: b42a4eb0091220d0ef604926f09f5418557ccbee61fa82636875787f198097ee

```md
## Context

项目已在 `codex/phase2-ui-acceptance` 基线具备 Next.js 动态监控页、`DeviceService`/`TelemetryService`、Demo seed（三台代表性 CT）与 Excel 导入。架构文档提及离线 HTML 快照，但 `src/export/` 尚未落地。干系人需要可外发、可双击审阅的离线包，同时保持与在线页一致的监测语义。

约束：只读；不连公司库；不提交真实数据与生成物；Windows/`file://` 可用；产物语言与交互对齐现有中文 UI。

## Goals / Non-Goals

**Goals:**
- 以共享 ViewModel 复用现有领域服务生成离线 UI。
- 交付单文件、多设备 Bundle、ZIP 与 CLI（SQLite/Demo/Excel）。
- 交付自动化测试（含无网络 Playwright）与指南/验收报告。

**Non-Goals:**
- 公司真实库联调、PostgreSQL、MQTT、设备控制/OTA。
- 用 Next 静态导出或依赖本地 HTTP 服务器打开产物。
- 提交 Excel/DB/HTML/ZIP 到 Git。

## Decisions

1. **渲染路径：模板 HTML + 内嵌 runtime，而非 React SSR**
   - 理由：`file://` 下避免 hydration/路由依赖；体积与行为可控。
   - 备选：Next `output: export`（仍偏在线假设）；Playwright 另存为（不可复现、难测）。

2. **业务语义：只通过 ViewModel 调用现有服务/domain**
   - 理由：防止离线页与在线页规则漂移。
   - 备选：在 HTML 中重写判定（拒绝）。

3. **ECharts：单文件全文内嵌；Bundle 共享 `assets/echarts.min.js`**
   - 理由：单文件真正自包含；Bundle 控制体积且相对路径在 `file://` 可用。
   - 备选：每页都内嵌（简单但体积膨胀）。

4. **Excel：临时 SQLite → 复用现有导入 → 导出 → finally 清理**
   - 理由：与生产导入路径一致，避免第二套解析。

5. **实现基线：从 `origin/codex/phase2-ui-acceptance` 开 `codex/offline-html-export`**
   - 理由：该分支已有 Demo 与 UI 语义；`main` 落后。

6. **模块落点：`src/export/offline/*` + `scripts/export-offline-html.ts`**
   - 理由：与计划清单一致，边界清晰。

## Risks / Trade-offs

- [单文件体积大] → 可接受；文档说明；Bundle 共享 ECharts 缓解多页膨胀。
- [在线页与离线页 UI 细微差异] → ViewModel 对齐现有 page 聚合字段；交互用独立 runtime 复刻关键能力。
- [Excel 样例缺失导致 Excel 路径无法现场验收] → Demo 路径为 PASS 主路径；Excel 有样例则受控验证，无样例记为已知限制。
- [工作区存在无关未跟踪 IDE 文件] → 不提交；仅改导出相关与必要 ignore。

## Migration Plan

1. 检出基线并创建功能分支，跑门禁。
2. 落地导出模块、脚本、测试、文档。
3. 本地生成 `artifacts/offline-ui/**`（gitignore）。
4. 提交源码/测试/文档，不推送。
5. 回滚：还原功能分支提交即可；无生产 schema 迁移。

## Open Questions

- 用户是否提供脱敏 Excel 用于受控 `export:html:excel`（可选，不阻塞 Demo PASS）。
- build 阶段工作方式（isolation/build_mode/tdd/review）待 Comet build 决策点确认。

```

## openspec/changes/offline-html-export/tasks.md

- Source: openspec/changes/offline-html-export/tasks.md
- Lines: 1-37
- SHA256: 3aa286e63f86710db24e6662d84da26f519b6d11285768e733d46747a01a1c65

```md
## 1. 分支与基线门禁

- [ ] 1.1 从 `origin/codex/phase2-ui-acceptance` 创建分支 `codex/offline-html-export`，合并本轮必需 ignore（`artifacts/offline-ui/`）
- [ ] 1.2 执行 `npm install`、`prisma:generate`、`typecheck`、`lint`、`test`、`build`、`test:e2e`；失败先修回归

## 2. Offline ViewModel 与复用层

- [ ] 2.1 新增 `src/export/offline/types.ts`（ViewModel、CLI 选项、`EMPTY='—'`）
- [ ] 2.2 实现 `build-device-view-model.ts`（编排 DeviceService/TelemetryService，含 8 通道与 charts）
- [ ] 2.3 实现 `build-overview-view-model.ts` 与 `build-inverter-view-model.ts`
- [ ] 2.4 实现 `escapeHtml`、`safeFileToken`、今日发电跨日断线辅助，复用 monitoring/faults

## 3. 渲染、运行时与打包

- [ ] 3.1 实现 `styles.ts` 与 `client-runtime.ts`（弹窗、1/3/7、图例、zoom/pan/slider/复位、负值标红、无 fetch）
- [ ] 3.2 实现 `echarts-asset.ts` 与 `render-html.ts`（单文件内嵌；Bundle 相对 assets）
- [ ] 3.3 实现 `package-export.ts`（单文件、bundle、README.txt、ZIP）

## 4. CLI 与数据入口

- [ ] 4.1 实现 `cli.ts` + `scripts/export-offline-html.ts`（全部参数与 `--help`，非法非零退出）
- [ ] 4.2 支持 `--db`/`APP_DATABASE_URL`、`--demo` 与 `export:html:demo` 规定产物名
- [ ] 4.3 实现 Excel→临时 SQLite→导入→导出→清理；接线 `export:html:excel`
- [ ] 4.4 更新 `package.json` 脚本：`export:html`、`export:html:demo`、`export:html:excel`、`test:offline-html`

## 5. 测试与截图

- [ ] 5.1 单元测试：ViewModel、缺失值、故障、逆流、离线窗、跨日断线、escape、文件名
- [ ] 5.2 集成测试：demo/excel/单文件/bundle/ZIP/重复导出/自定义 out
- [ ] 5.3 Playwright `file://` 离线用例 + 全网拦截 + review 截图生成

## 6. 产物、文档与收尾

- [ ] 6.1 实际执行 `demo:seed` 与 `export:html:demo`，确认 HTML/ZIP 存在
- [ ] 6.2 撰写 `docs/OFFLINE_HTML_EXPORT_GUIDE.md` 与 `OFFLINE_HTML_EXPORT_REPORT.md`
- [ ] 6.3 更新 `README.md`、`docs/05`、`docs/06`
- [ ] 6.4 跑满验收命令与 `git diff --check`，本地提交 `feat: add offline HTML dashboard export`（不推送）

```

## openspec/changes/offline-html-export/specs/offline-html-export/spec.md

- Source: openspec/changes/offline-html-export/specs/offline-html-export/spec.md
- Lines: 1-59
- SHA256: 473c1ac329b0d7a9950096cce1a4a985d24bf1c4a63c67a00dc245a3214c2d0e

```md
## ADDED Requirements

### Requirement: Offline single-file device dashboard
系统 MUST 能为指定 CT SN 生成一份自包含单文件 HTML：内嵌 CSS、JavaScript、ECharts 运行时与设备 ViewModel；MUST NOT 引用 CDN、远程资源或在页面中使用 `fetch()`；用户 MUST 能通过 `file:///` 双击打开并在断网下使用图表与交互。

#### Scenario: Demo online device single-file export
- **WHEN** 用户对 Demo 库执行单文件导出且 SN 为 `DEMO-CT-ONLINE-001`
- **THEN** 生成可双击打开的单 HTML，页面展示 CT 状态、逆流面板、功率总览、电网质量、能源 KPI、固定 8 微逆卡片，且无网络请求

#### Scenario: Missing values render as dash
- **WHEN** ViewModel 中某指标缺失
- **THEN** 界面文本显示 `—`，且 MUST NOT 出现 `undefined`、`null` 或 `NaN`

### Requirement: Offline multi-device bundle and ZIP
系统 MUST 支持导出多设备离线包：包含总览 `index.html`、各 CT 设备页、微逆详情页与本地静态资源（或每页自包含）；页面间 MUST 使用相对路径跳转；MUST 可打包为 ZIP；打开与跳转 MUST NOT 依赖 Next.js、SQLite 或互联网。

#### Scenario: Bundle navigation under file protocol
- **WHEN** 用户解压 ZIP 后以 `file:///` 打开 `bundle/index.html` 并进入某 CT 与微逆详情
- **THEN** 跳转成功且后退可用，全程无 HTTP/HTTPS 请求

### Requirement: Export data sources and CLI
系统 MUST 支持从现有 SQLite、Demo seed、Excel（经临时 SQLite 导入后导出并清理）三种输入导出；MUST 提供 `export:html`、`export:html:demo`、`export:html:excel` 脚本及 `--help`；非法参数 MUST 非零退出且 MUST NOT 留下半成品。

#### Scenario: Demo one-shot export
- **WHEN** 用户执行 `npm run demo:seed` 后执行 `npm run export:html:demo`
- **THEN** 至少生成三台 Demo 单文件示例、`bundle/index.html` 与 `anti-reverse-device-ui-demo.zip`

#### Scenario: Invalid CLI arguments
- **WHEN** 用户未提供 `--sn`/`--all` 或 Excel 路径缺失等非法组合
- **THEN** CLI 输出明确错误并以非零码退出，且不生成半成品目录内容

### Requirement: Reuse domain monitoring semantics
离线导出 MUST 通过共享 ViewModel 复用现有设备/遥测服务与 domain 规则（逆流判定、离线窗口、故障掩码解码、状态字典、图表 series），MUST NOT 另起一套业务语义。

#### Scenario: Reverse flow uses phase power rule
- **WHEN** A/B/C 任一相功率小于 0
- **THEN** 离线页判定为严重逆流告警并红色突出负值相，文案与在线页语义一致

#### Scenario: Fault mask decoding
- **WHEN** 故障掩码置位对应 PV 欠压等位
- **THEN** 界面展示完整中文故障名（含正确空格，如 `PV1 输入欠压`），值为 0 时显示“当前无故障”，缺失时显示 `—`，并保留十六进制原始码

### Requirement: Offline chart interactions
离线图表 MUST 支持 1/3/7 天切换、滚轮缩放、拖动、slider、tooltip、复位；功率图 MUST 支持图例选择单/双/三曲线；今日发电量跨日归零 MUST 断线；相位与微逆可点指标 MUST 打开离线弹窗曲线。

#### Scenario: Phase card opens history dialog
- **WHEN** 用户点击 A/B/C 相卡片
- **THEN** 打开离线弹窗展示该相最近窗口曲线，且包含负值标红与 0 W 基准线能力

#### Scenario: Today energy disconnects across day boundary
- **WHEN** 今日发电量序列跨自然日归零
- **THEN** 曲线在跨日处断开，MUST NOT 将前一日高点与次日零点错误连线

### Requirement: Offline acceptance evidence
仓库 MUST 提供自动化测试覆盖 ViewModel/CLI/产物/ZIP，以及 Playwright `file://` 用例；Playwright MUST 拦截全部 HTTP/HTTPS，一旦页面发起网络请求则失败；文档 MUST 说明导出与查看方式，并记录验收状态。

#### Scenario: Playwright offline network guard
- **WHEN** 运行离线 HTML Playwright 套件
- **THEN** 以 `file:///` 打开生成页，拦截网络；若出现 HTTP/HTTPS 请求则测试失败

```
