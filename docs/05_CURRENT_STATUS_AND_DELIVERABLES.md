# 当前完成情况与交付物

## 一期 SQLite 动态 MVP：已完成

交付内容：

- Next.js 15 App Router、TypeScript、Prisma 与 SQLite schema/migrations；
- Excel 导入（`ExcelSourceAdapter` + `DeviceLogExcelAdapter`）、去重、SIID/PIID 透传、数据质量报告；
- Mongo 设备日志只读增量同步（`MongoLogSourceAdapter` + `SourceSyncService`），独立 Worker 进程；
- 复合游标幂等同步（`sourceRecordId` 三级去重），checkpoint 与同步审计；
- 多 SN 查询，支持完整 SN 和唯一末尾编号；
- CT 动态运行页：核心 KPI、平台连通性、三相逆流区间、ECharts 功率/电网质量曲线；
- 北京日出日落昼夜背景带（NOAA 近似算法）；
- 固定 1～8 微逆卡片和独立详情页；
- 状态字典、故障掩码解码与故障变化历史；
- CT 和微逆在线/离线窗口分析（15 分钟心跳间隙模型）；
- 可配置 7 天 retention，且不删除元数据、latest 状态、checkpoint 或导入审计；
- Unit（25 文件 88 测试）、SQLite integration 与 Playwright E2E 测试；
- 离线 HTML 快照导出（单文件 / Bundle / ZIP），CLI 支持 SQLite / Demo / Excel；
- 离线 HTML 自描述回环（从 HTML 提取视图模型，重新渲染）；
- 手写 ZIP 打包器（零依赖）；
- Docker Compose 双服务部署（Web + Sync Worker）；
- 软刷新机制（45s 间隔，`POST /api/live` → `revalidatePath` → `router.refresh`）。

页面入口：

- `/devices`
- `/devices/[sn]`
- `/devices/[sn]/inverters/[index]`

## 已知限制

- 未连接真实公司数据库（二期状态 `PARTIAL`），新增 12 台设备使用 Demo 种子数据；
- 逆流检测无迟滞阈值，`-0.01W` 即触发严重告警，且只有一级严重性（`critical`）；
- 故障严重性判断 `hasCriticalFault` 使用英文正则匹配中文字典，始终返回 `false`；
- 图表不降采样，`sampling: undefined` 显式设置，所有原始样本点全量绘制；
- 设备列表筛选和排序在内存中完成（服务端全量查询，前端 post-hoc 处理）；
- CSS 在线和离线路径独立维护，已产生结构性分歧；
- 图表运行时在线和离线路径手工移植，`client-runtime.ts` 是 `telemetry-chart.tsx` 的独立实现；
- 设备详情页一次 RSC 渲染约 25 个并发服务调用，性能敏感；
- 微逆 SN、版本、相位和接入点未进入 Excel 导出，始终显示 `—`。

## 二期当前状态（2026-07-22）

- 状态：`PARTIAL`。
- 已完成：一期基线冻结、Source Adapter 合同升级、映射验证、脱敏探查、Mock 增量同步、SQLite checkpoint/批次/错误审计、迁移与测试。
- 阻断：未提供真实只读连接、只读权限证明、源类型/视图、SIID/PIID 字段映射与真实设备样本；未尝试连接或写入公司数据库。
- 入口：`docs/PHASE2_ACCEPTANCE_REPORT.md`、`docs/PHASE2_SOURCE_INSPECTION_REPORT.md`、`docs/PHASE2_DATA_QUALITY_REPORT.md`。
