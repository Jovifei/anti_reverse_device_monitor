# Brainstorm Summary

- Change: offline-html-export
- Date: 2026-07-24

## 确认的技术方案

**方案 A（已确认）：共享 ViewModel + 模板 HTML + 内嵌/共享 ECharts runtime**

- `DeviceService` / `TelemetryService` / `domain` → Offline ViewModel JSON
- `render-html` 生成单文件（CSS/JS/ECharts/数据全内嵌）与 Bundle（相对路径引用 `assets/echarts.min.js`）
- CLI 编排 SQLite / Demo / Excel（临时 SQLite → 现有导入 → 导出 → finally 清理）
- 功能分支从 `origin/codex/phase2-ui-acceptance` 拉出 `codex/offline-html-export`
- 模块落点：`src/export/offline/*` + `scripts/export-offline-html.ts`
- Playwright 以 `file:///` 打开产物并拦截全部 HTTP/HTTPS

否决：方案 B（Next 静态导出）、方案 C（Playwright 另存 HTML）。

## 关键取舍与风险

- 单文件体积大（内嵌 echarts.min.js）→ 可接受；Bundle 共享脚本缓解多页膨胀
- 在线/离线 UI 细微差异 → ViewModel 对齐现有 page 聚合字段；client-runtime 复刻关键交互
- Excel 样例可能缺失 → Demo 为主验收路径；有脱敏 Excel 再受控验证
- 工作区无关 IDE/工具文件 → 不提交；仅改导出相关与必要 ignore

## 测试策略

- Unit：ViewModel、缺失值、故障解码、逆流、离线窗、跨日断线、HTML escape、安全文件名
- Integration：Demo/Excel → HTML、单文件、Bundle、ZIP、重复导出、自定义 out
- Playwright：`file:///` 加载、无 console error、功率图/弹窗、状态颜色、故障文案、无网络请求

## Spec Patch

无
