---
change: offline-html-export
design-doc: docs/superpowers/specs/2026-07-24-offline-html-export-design.md
base-ref: e19af0770e088f77444308043a2162ee1633f169
---

# 离线 HTML UI 导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可 `file:///` 断网打开的单文件/Bundle/ZIP 离线监控 UI，以及 SQLite/Demo/Excel 导出 CLI 与自动化验收。

**Architecture:** 复用 DeviceService/TelemetryService/domain 生成 Offline ViewModel；模板渲染内嵌 CSS/JS/ECharts；CLI 编排三种数据源；Playwright 以 file 协议 + 全网拦截验收。

**Tech Stack:** TypeScript、Prisma/SQLite、ECharts（本地内嵌）、Vitest、Playwright、Node ZIP

---

## 文件地图

| 路径 | 职责 |
|---|---|
| `src/export/offline/types.ts` | VM 与 CLI 类型 |
| `src/export/offline/build-*-view-model.ts` | 服务编排 → VM |
| `src/export/offline/render-html.ts` 等 | HTML/CSS/runtime/ECharts/打包 |
| `scripts/export-offline-html.ts` | CLI 入口 |
| `tests/unit/offline-*.test.ts` | 单元 |
| `tests/integration` / `tests/e2e/offline-html*` | 集成与离线 E2E |
| `docs/OFFLINE_HTML_EXPORT_*.md` | 指南与报告 |

---

### Task 1: 分支与基线门禁

**Files:**
- Modify: `.gitignore`（增加 `artifacts/offline-ui/`）

- [ ] **Step 1:** 确认工作区：不覆盖无关已跟踪改动；不提交 IDE 杂文件
- [ ] **Step 2:** 从 `origin/codex/phase2-ui-acceptance` 创建实现分支（名称由联合决策确认，推荐 `codex/offline-html-export` 或 `feature/20260724/offline-html-export`）
- [ ] **Step 3:** `npm install` → `prisma:generate` → `typecheck` → `lint` → `test` → `build` → `test:e2e`；失败先修

### Task 2: ViewModel 基础与单元测试（TDD）

**Files:**
- Create: `src/export/offline/types.ts`
- Create: `src/export/offline/html-utils.ts`（escapeHtml、safeFileToken、断日 series）
- Create: `tests/unit/offline-html-utils.test.ts`

- [ ] **Step 1:** 先写失败单测（escape、文件名、跨日断线、EMPTY）
- [ ] **Step 2:** 实现 utils 使测试通过
- [ ] **Step 3:** 提交 `test: add offline html util coverage`（若执行策略要求逐步提交）

### Task 3: 构建设备/总览/微逆 ViewModel

**Files:**
- Create: `src/export/offline/build-device-view-model.ts`
- Create: `src/export/offline/build-overview-view-model.ts`
- Create: `src/export/offline/build-inverter-view-model.ts`
- Create: `tests/unit/offline-view-model.test.ts`

- [ ] **Step 1:** 用 Demo/fixture 思路写 VM 单测（逆流、8 通道、故障文案、缺失 `—`）
- [ ] **Step 2:** 实现 builder，只调用现有 DeviceService/TelemetryService/domain
- [ ] **Step 3:** 跑通 unit

### Task 4: 渲染、runtime、ECharts、打包

**Files:**
- Create: `src/export/offline/styles.ts`
- Create: `src/export/offline/client-runtime.ts`
- Create: `src/export/offline/echarts-asset.ts`
- Create: `src/export/offline/render-html.ts`
- Create: `src/export/offline/package-export.ts`

- [ ] **Step 1:** 实现 styles + runtime（弹窗、1/3/7、zoom/pan/slider、图例、无 fetch）
- [ ] **Step 2:** 实现单文件内嵌与 Bundle 相对 assets
- [ ] **Step 3:** 实现 ZIP 与安全写盘（失败不留半成品）

### Task 5: CLI 与三数据源

**Files:**
- Create: `src/export/offline/cli.ts`
- Create: `scripts/export-offline-html.ts`
- Modify: `package.json`
- Create/Modify: Excel 临时导入封装（复用 `ExcelSourceAdapter`）

- [ ] **Step 1:** CLI `--help` 与非法参数非零退出测试
- [ ] **Step 2:** `--db`/`--demo`/`--excel`/`--single-file`/`--bundle`/`--out`
- [ ] **Step 3:** 接线 `export:html`、`export:html:demo`、`export:html:excel`、`test:offline-html`

### Task 6: 集成与 Playwright 离线验收

**Files:**
- Create: `tests/integration/offline-html-export*` 或扩展 runner
- Create: `tests/e2e/offline-html.spec.ts`、`tests/e2e/run-offline-html.ts`

- [ ] **Step 1:** Demo → 单文件/Bundle/ZIP 集成断言
- [ ] **Step 2:** Playwright `file://` + 网络拦截 + 关键交互
- [ ] **Step 3:** 生成 `artifacts/offline-ui/review/*.png`

### Task 7: 实际产物与文档收尾

**Files:**
- Create: `docs/OFFLINE_HTML_EXPORT_GUIDE.md`
- Create: `docs/OFFLINE_HTML_EXPORT_REPORT.md`
- Modify: `README.md`、`docs/05_*`、`docs/06_*`
- Modify: `openspec/changes/offline-html-export/tasks.md`（勾选完成项）

- [ ] **Step 1:** `npm run demo:seed` && `npm run export:html:demo`，确认规定路径产物存在
- [ ] **Step 2:** 写指南与报告（含绝对路径与 `OFFLINE_HTML_EXPORT_STATUS`）
- [ ] **Step 3:** 全量验证命令；本地提交 `feat: add offline HTML dashboard export`（不推送）

---

## 验收命令（最终）

```powershell
npm run prisma:generate
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run demo:seed
npm run export:html:demo
npm run test:offline-html
git diff --check
```
