## 1. 分支与基线门禁

- [x] 1.1 从 `origin/codex/phase2-ui-acceptance` 创建分支 `codex/offline-html-export`，合并本轮必需 ignore（`artifacts/offline-ui/`）
- [x] 1.2 执行 `npm install`、`prisma:generate`、`typecheck`、`lint`、`test`、`build`、`test:e2e`；失败先修回归

## 2. Offline ViewModel 与复用层

- [x] 2.1 新增 `src/export/offline/types.ts`（ViewModel、CLI 选项、`EMPTY='—'`）
- [x] 2.2 实现 `build-device-view-model.ts`（编排 DeviceService/TelemetryService，含 8 通道与 charts）
- [x] 2.3 实现 `build-overview-view-model.ts` 与 `build-inverter-view-model.ts`
- [x] 2.4 实现 `escapeHtml`、`safeFileToken`、今日发电跨日断线辅助，复用 monitoring/faults

## 3. 渲染、运行时与打包

- [x] 3.1 实现 `styles.ts` 与 `client-runtime.ts`（弹窗、1/3/7、图例、zoom/pan/slider/复位、负值标红、无 fetch）
- [x] 3.2 实现 `echarts-asset.ts` 与 `render-html.ts`（单文件内嵌；Bundle 相对 assets）
- [x] 3.3 实现 `package-export.ts`（单文件、bundle、README.txt、ZIP）

## 4. CLI 与数据入口

- [x] 4.1 实现 `cli.ts` + `scripts/export-offline-html.ts`（全部参数与 `--help`，非法非零退出）
- [x] 4.2 支持 `--db`/`--demo` 与 `export:html:demo` 规定产物名
- [x] 4.3 实现 Excel→临时 SQLite→导入→导出→清理；接线 `export:html:excel`
- [x] 4.4 更新 `package.json` 脚本：`export:html`、`export:html:demo`、`export:html:excel`、`test:offline-html`

## 5. 测试与截图

- [x] 5.1 单元测试：ViewModel、缺失值、故障、逆流、离线窗、跨日断线、escape、文件名
- [x] 5.2 集成测试：demo/excel/单文件/bundle/ZIP/重复导出/自定义 out
- [x] 5.3 Playwright `file://` 离线用例 + 全网拦截 + review 截图生成

## 6. 产物、文档与收尾

- [x] 6.1 实际执行 `demo:seed` 与 `export:html:demo`，确认规定路径产物存在
- [x] 6.2 撰写 `docs/OFFLINE_HTML_EXPORT_GUIDE.md` 与 `OFFLINE_HTML_EXPORT_REPORT.md`
- [x] 6.3 更新 `README.md`、`docs/05`、`docs/06`
- [x] 6.4 跑满验收命令与 `git diff --check`，本地提交 `feat: add offline HTML dashboard export`（不推送）
