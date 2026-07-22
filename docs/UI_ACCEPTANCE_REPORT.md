# UI 验收交付报告

UI_ACCEPTANCE_STATUS: READY

> 本报告记录本轮收口的全新门禁、截图和进程清理证据。所有条目已成功完成。

## 1. 历史基线与审计结论

`fbd182a` 保留了已审阅的 CT、微逆、故障文案、遥测图表与 Demo 数据改进。其提交前启动的截图任务遗留了多个进程树；这些进程已按精确归属清理。旧截图和旧门禁结果标记为历史基线，不可作为当前最终版本的验收证据。

## 2. 本轮收口范围

- 配置包使常规开发继续使用 `.next`，而截图运行使用独立构建目录；ESLint、TypeScript 和 Git 忽略生成目录，不弱化严格检查。
- 微逆卡片恢复“今日发电时长”，并继续显示固定八通道的状态和缺失值占位符。
- 故障名称统一为 `PV1 输入欠压`、`PV2 输入欠压`、`PV 电压异常`；E2E 阻止旧无空格文案及 `undefined`、`null`、`NaN` 回归。
- 截图脚本采用锁、唯一端口/目录、原子发布、信号清理和仅针对脚本拥有的 Windows 进程树终止。

## 3. 当前截图验收记录

2026-07-23 00:08（Asia/Shanghai）执行了一次新的 `npm run ui:capture`。该任务使用独立端口 `7662` 和构建目录 `.next-ui-capture-84828-1784736467918`，退出码为 0，且完成后无 capture 进程、锁或临时构建目录残留。

| 文件名 | 大小 | 生成时间 | 页面与场景 | 独立端口 | 构建目录 | 任务退出 |
| --- | --- | --- | --- | --- | --- | --- |
| `desktop-ct-main.png` | 1,138,319 B | 2026-07-23 00:08:02 | 在线 CT 主视图 | 7662 | `.next-ui-capture-84828-1784736467918` | 正常（0） |
| `desktop-phase-history-dialog.png` | 1,122,112 B | 2026-07-23 00:08:02 | A 相 CT 历史弹窗 | 7662 | 同上 | 正常（0） |
| `desktop-inverter-grid.png` | 1,138,319 B | 2026-07-23 00:08:04 | 在线 CT 微逆网格 | 7662 | 同上 | 正常（0） |
| `desktop-inverter-metric-dialog.png` | 1,103,985 B | 2026-07-23 00:08:04 | 微逆 PV1 历史弹窗 | 7662 | 同上 | 正常（0） |
| `desktop-inverter-offline-history.png` | 410,017 B | 2026-07-23 00:08:06 | 离线微逆历史 | 7662 | 同上 | 正常（0） |
| `desktop-reverse-flow-alerts.png` | 875,605 B | 2026-07-23 00:08:08 | 三相逆流告警 | 7662 | 同上 | 正常（0） |
| `mobile-ct-main.png` | 897,970 B | 2026-07-23 00:08:09 | 移动端在线 CT | 7662 | 同上 | 正常（0） |
| `mobile-inverter-grid.png` | 897,970 B | 2026-07-23 00:08:10 | 移动端微逆网格 | 7662 | 同上 | 正常（0） |
| `mobile-metric-dialog.png` | 863,465 B | 2026-07-23 00:08:11 | 移动端微逆指标弹窗 | 7662 | 同上 | 正常（0） |

预期的 9 张截图为：`desktop-ct-main.png`、`desktop-phase-history-dialog.png`、`desktop-inverter-grid.png`、`desktop-inverter-metric-dialog.png`、`desktop-inverter-offline-history.png`、`desktop-reverse-flow-alerts.png`、`mobile-ct-main.png`、`mobile-inverter-grid.png`、`mobile-metric-dialog.png`。`artifacts/ui-review/` 始终受 Git 忽略。

## 4. 重新执行的门禁

```powershell
npm run prisma:generate
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run demo:seed
npm run verify-data
npm run cleanup -- --dry-run
npm run ui:capture
git diff --check
```

全部命令均在本轮重新执行并通过：Prisma Client 生成、严格类型检查、ESLint、17 项单元/集成测试、生产构建、8 项 E2E、Demo 数据生成、数据校验、保留清理 dry-run 和唯一一次截图采集。截图后确认 `.capture.lock` 不存在、`.next-ui-capture-*` 与 `.next-validation` 临时目录数为 0，`capture-ui-review.ts` 进程数为 0；`git diff --check` 通过。

## 5. 本地交付约束

目标分支为 `codex/phase2-ui-acceptance`。本轮将仅创建本地提交 `fix: reconcile UI refinement and capture workflow`；不推送，不合并到 `main`。人工验收入口为本报告、[UI_REVIEW_GUIDE.md](UI_REVIEW_GUIDE.md) 和新生成的忽略截图。
