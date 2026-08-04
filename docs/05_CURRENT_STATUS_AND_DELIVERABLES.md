# 当前完成情况与交付物

> 更新日期：2026-08-04。实现声明以当前仓库代码为准。

## 已交付（本地联调可用）

- Next.js 15 App Router、TypeScript、Prisma 与 SQLite schema/migrations；
- Excel 导入与 Mongo `device_log_*` 只读增量同步（`SourceSyncService` + 独立 `source:worker`）；
- 复合游标幂等写入、checkpoint / sync 批次审计；
- `start-monitor.ps1`：迁移 → SN 映射 → 追同步 → Worker → Next；
- 多 SN 查询（完整 SN / 唯一后缀）；
- 总览优先卡与筛选：正在逆流、**近7天长时逆流(≥40min)**、待处理离线、存在离线微逆、在线/活跃；
- CT 详情：KPI、三相逆流区间、ECharts、昼夜背景、固定 1～8 微逆卡、连通性/故障历史；
- 在线微逆个数展示、离线微逆通道号标注；
- 软刷新策略：总览指纹变化才刷；**详情页禁止自动 soft-refresh**（避免 Next 假死）；
- Prisma SQLite `socket_timeout` + `connection_limit=1`；
- 离线 HTML 导出；Docker Compose（`app` + `sync` profile）。

页面入口：

- `/devices`
- `/devices/[sn]`
- `/devices/[sn]/inverters/[index]`

操作见 [11_OPS_RUNBOOK.md](./11_OPS_RUNBOOK.md)。

## 已知限制

- 逆流检测无迟滞阈值，负功率即计为逆流区间；长时逆流按区间时长 ≥40 分钟统计；
- 设备详情页一次 RSC 仍很重（约 8 路摘要 + 8 路曲线）；自动刷新已禁用，手动刷新仍可能较慢；
- 隔夜后首次 `source:sync` 可能达十几分钟（checkpoint 空窗大），属预期；
- Docker 部署依赖本机 Docker；构建时打入 `config/`，改注册表需重建或挂载；
- 图表不降采样；列表筛选在服务端对活跃设备聚合后分页；
- ⚠️ 本开发机若未安装 Docker，Compose 路径待环境验证。

## 二期 / Mongo

- 本地可对真实 Mongo 只读联调（凭 `.env.local`）。
- 入口：`docs/MONGODB_READONLY_SOURCE.md`、`docs/PHASE2_ACCEPTANCE_REPORT.md`。
