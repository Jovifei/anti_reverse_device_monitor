# 二期公司数据源 Adapter 接入指南

二期通过 `src/adapters/source-db/source-telemetry-adapter.ts` 的 `SourceTelemetryAdapter` 接口接入公司批准的只读 API、只读副本或只读视图。浏览器只访问本系统 API，永远不获取 `SOURCE_DATABASE_URL` 或任何数据库凭据。

接入前需要由数据源负责人填写 `config/source-field-mapping.example.json` 的映射，并确认每条源记录至少提供：`sourceRecordId`、`deviceSn`、`siid`、`piid`、`inverterIndex`、`reportedAt`、`receivedAt` 和 `value`。不得猜测表名、字段名或微逆归属。

实现步骤：

1. 基于 `CompanySourceAdapterStub` 新建服务端只读实现。
2. 为每个查询设置 `SOURCE_QUERY_TIMEOUT_SECONDS` 超时，并使用 `cursor` 与 `limit` 分页。
3. 将源时区转换为 UTC `Date`，保留接收时间与上报时间。
4. 按 `sourceRecordId` 去重，写入本系统 SQLite/PostgreSQL，不对公司源执行写操作。
5. 使用 `SyncCheckpoint` 保存成功游标和失败状态，日志中仅记录脱敏的统计信息。
6. 先用 `MockSourceAdapter` 验证增量、去重与断点恢复，再申请公司只读数据源联调。

该模板不包含公司连接地址、密码、表名、控制权限或 MQTT 发布能力。
