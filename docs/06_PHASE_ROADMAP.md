# 阶段计划

## 阶段 0：离线原型验证：已完成

V4 原型完成了页面结构、三相负功率规则、8 台微逆布局和图表交互验证。

## 一期：SQLite 动态 MVP：已完成

已交付 Next.js + TypeScript、Prisma + SQLite、Excel 导入、多 SN 查询、CT 与 8 台微逆页面、最近 7 天查询、ECharts 缩放/平移、状态/故障字典、严重逆流区间、7 天 retention、测试和验收报告。

**离线 HTML 快照能力已实现**（`src/export/offline/`，`npm run export:html:demo`），可在无 Next.js / 无数据库 / 无网络环境下双击查看。

一期不包含控制、OTA、MQTT 发布、配对解绑或真实公司数据库连接。

## 二期：公司数据库只读接入：待执行

入口：`src/adapters/source-db/` 与 `docs/PHASE2_SOURCE_ADAPTER_GUIDE.md`。

二期工作：

1. 由数据源负责人确认只读视图/API、字段映射、唯一记录 ID 和查询限流。
2. 实现 `SourceTelemetryAdapter` 的公司只读版本并设置超时、分页、游标和时区转换。
3. 使用 `MockSourceAdapter` 验证增量、去重、断点恢复和失败审计。
4. 接入 `SyncCheckpoint`，在 SQLite 中进行受控联调。

## 三期：PostgreSQL 与生产化：待执行

迁移目标包括 PostgreSQL、备份恢复、索引与性能测试、HTTPS、认证、权限和运行监控。

## 二期执行结果（2026-07-22）

二期离线基础已完成，真实公司数据源联调保持 `PARTIAL`：等待批准的只读连接、数据源类型/视图、局部字段映射和脱敏测试设备。完成这些前置条件后，使用现有 `SourceTelemetryAdapter` 的具体只读实现进行受控探查、小范围同步和多设备验收；不需要重建一期 UI 或 SQLite 领域模型。
