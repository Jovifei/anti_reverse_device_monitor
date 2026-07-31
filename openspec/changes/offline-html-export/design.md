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
