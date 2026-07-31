# 防逆流设备运行可视化系统

一期为 Next.js + TypeScript + Prisma + SQLite 的只读动态 MVP。系统导入脱敏 Excel 后，按 CT SN 查询最近 7 天的运行数据；浏览器不持有数据库密码，也不具备 MQTT、OTA、参数下发、配对或解绑能力。

## 运行

1. `npm install`
2. 复制 `config/.env.local.example` 为 `.env.local`，配置 `APP_DATABASE_URL=file:../data/device-monitor.db`
3. `npm run prisma:generate`
4. 在首次使用前创建空文件 `data/device-monitor.db`，再执行 `npx prisma db push`
5. `npm run import:excel <excel_file> [sn]`
6. `npm run dev`

## 一期功能

- 完整 SN 或可唯一识别的末尾编号查询；
- CT 运行状态、三相反送严重告警、1/3/7 天 ECharts 功率与电网质量曲线；
- 固定 1～8 微逆卡片及微逆详情页；
- online_state、工作状态和故障位掩码领域字典解码；
- 7 天在线/离线窗口、故障变化、retention 和数据质量报告；
- Excel/Fixture Adapter；
- 二期公司数据源的只读 Adapter 合同、Mock 和 Stub。

## 验证命令

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm run verify-data`
- `npm run cleanup -- --dry-run`
- `npm run export:html:demo`
- `npm run test:offline-html`

详细验收记录见 [一期验收报告](docs/PHASE1_ACCEPTANCE_REPORT.md)。公司数据源接入步骤见 [二期 Adapter 指南](docs/PHASE2_SOURCE_ADAPTER_GUIDE.md)。Mongo 日志只读接入见 [Mongo 只读说明](docs/MONGODB_READONLY_SOURCE.md)。Docker 部署见同文档「Docker」节。离线 HTML 导出见 [离线导出指南](docs/OFFLINE_HTML_EXPORT_GUIDE.md)。

## 离线 HTML 快照

已实现：单设备自包含 HTML、多设备 Bundle、ZIP，以及从 SQLite / Demo / Excel 导出。命令：`npm run export:html`、`npm run export:html:demo`、`npm run export:html:excel`。生成物位于 `artifacts/offline-ui/`（gitignore）。

## 二期状态

二期离线同步基础已交付：字段映射校验、脱敏探查、复合游标、Mock→SQLite 幂等同步、checkpoint 与同步审计。真实公司只读数据源尚未配置，因此二期真实联调状态为 `PARTIAL`；详见 `docs/PHASE2_ACCEPTANCE_REPORT.md`。使用根目录 `.env.local.example` 创建本地配置，真实字段映射只放在已忽略的 `config/source-field-mapping.local.json`。

二期命令：`npm run source:validate-mapping`、`npm run source:inspect`、`npm run source:sync -- --dry-run`。
