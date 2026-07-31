## Why

公司 Mongo 日志库已有按 `device_log_<productId>` 分片的设备运行日志，监控前端目前只能从 Excel/本地库展示。需要只读接入该日志源，把 `device_id` + `data.<siid>_<piid>` 展开为现有遥测模型并同步到本地库，从而复用现有设备列表/详情/图表页。

## What Changes

- 新增 Mongo 只读 `SourceTelemetryAdapter`（`MongoLogSourceAdapter`），禁止对源库写操作。
- 新增设备注册表文件（`devices.json`）支持 SN↔`device_id`↔`product_id`；无 SN 时用占位 SN / 展示 `device_id`。
- 新增 `data` 字段映射配置，将 Studio 风格键展开为现有 `metricKey`/`siid`/`piid`。
- 将 `SOURCE_DB_TYPE=mongodb` 接入现有 `source:sync` 工厂；补充 registry 合并脚本与环境变量模板。
- 补充 fixture 单测与只读/索引诉求说明文档（不含真实凭据）。

## Capabilities

### New Capabilities

- `mongo-log-readonly-source`：Mongo `device_log_*` 只读查询、字段展开、设备注册表、同步进本地库并驱动现有 UI。

### Modified Capabilities

- （无）当前 `openspec/specs/` 无既有 capability 需改写。

## Impact

- 代码：`src/adapters/source-db/**`、`src/services/source-sync-service.ts`、设备展示回退、配置与脚本。
- 依赖：已有 `mongodb` 驱动；不新增 Python 服务；不引入 Docker（MVP）。
- 安全：凭据仅 `.env.local`；浏览器永不接触 URI/密码。
