# 当前完成情况与交付物

## 一期 SQLite 动态 MVP：已完成

交付内容：

- Next.js App Router、TypeScript、Prisma 与 SQLite schema/migrations；
- Excel 导入、去重、SIID/PIID 透传、数据质量报告；
- 多 SN 查询，支持唯一末尾编号；
- CT 动态运行页：核心 KPI、平台连续性、三相逆流区间、ECharts 功率/电网质量曲线；
- 固定 1～8 微逆卡片和独立详情页；
- 状态字典、故障掩码解码与故障变化历史；
- CT 和微逆离线窗口、当前离线时长；
- 可配置 7 天 retention，且不删除元数据、latest 状态、checkpoint 或导入审计；
- Unit、SQLite integration 与 Playwright E2E 测试；
- 二期 Source Adapter 的接口、Mock、公司数据源 Stub、字段映射示例和接入指南。

页面入口：

- `/devices`
- `/devices/[sn]`
- `/devices/[sn]/inverters/[index]`

## 已知限制

- 未连接公司数据库、平台 API 或 MQTT；
- Excel 样例没有提供的微逆 SN、版本、相位、接入点始终显示 `—`；
- 发电量单位仍需由固件或平台负责人确认；
- `metric_dictionary.example.json` 是示例字典，未登记的导入指标会在 `verify-data` 中报告为未知；
- 当前 SQLite engine 需要首次预先创建空数据库文件，测试脚本已自动处理该 Windows 环境限制。

## 二期当前状态（2026-07-22）

- 状态：`PARTIAL`。
- 已完成：一期基线冻结、Source Adapter 合同升级、映射验证、脱敏探查、Mock 增量同步、SQLite checkpoint/批次/错误审计、迁移与测试。
- 阻断：未提供真实只读连接、只读权限证明、源类型/视图、SIID/PIID 字段映射与真实设备样本；未尝试连接或写入公司数据库。
- 入口：`docs/PHASE2_ACCEPTANCE_REPORT.md`、`docs/PHASE2_SOURCE_INSPECTION_REPORT.md`、`docs/PHASE2_DATA_QUALITY_REPORT.md`。
