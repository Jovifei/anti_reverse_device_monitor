## Context

监控应用已有 Next.js + Prisma 本地库 + `SourceTelemetryAdapter`/`SourceSyncService`。公司 Mongo 日志以 `device_log_<productId>` 集合存储，文档含 `device_id`、秒级 `time`、嵌套 `data.<siid>_<piid>`。前端必须继续使用现有 `/devices` 页面。

## Goals / Non-Goals

**Goals:**

- 只读连接 Mongo，按集合/设备/时间窗分片查询。
- 展开 `data` 字段为 `SourceTelemetryRecord`，经现有 sync 写入本地库。
- 设备元数据文件化；无 SN 用占位 SN 展示。

**Non-Goals:**

- 不另起 Python 服务。
- 不对公司 Mongo 写数据或建索引。
- 不新建业务页面；不改控制/OTA/MQTT。
- 不爬取梦创 IoT Web；设备身份以本地注册表为准。
- Docker 仅打包本应用（含正式 sync 服务），不部署公司 Mongo 副本。

## Decisions

1. **后端选 Node/Next**：复用 `mongodb` 与 sync 管线；同步走 `tsx` CLI，避免 serverless 长连接。
2. **同步而非每请求直查 UI**：页面仍读 Prisma；Mongo 仅在 sync/inspect/registry 脚本中访问。
3. **应用侧分片**：强制 `product` 集合 + `device_id` + `time` 窗口；大窗切分子查询；`maxTimeMS` + limit/cursor。
4. **注册表**：`config/devices.json`（example 入库，真实文件可本地/gitignore）；`devices:sync-registry` 仅合并草案。

## Risks / Trade-offs

- 字段语义与 CT 字典不完全一致 → 映射文件显式配置，未识别键计 `unknownMetrics`。
- 无 `{device_id,time}` 索引时查询慢 → 文档向管理员诉求索引，应用侧收紧窗口。
- SN 缺失 → 占位 SN，人工补 registry。

## Migration Plan

1. 配置 `.env.local`（URI 占位密码本地填写）。
2. 填写 `devices.json` 与映射。
3. `source:sync --dry-run` 再正式 sync。
4. 用现有 UI 验收。

## Open Questions

- 生产库确切 `MONGODB_DATABASE` 名需本地确认（inspect 脚本探测）。
- 部分 Studio 字段与防逆流 CT 指标一对一关系需业务确认；MVP 按映射表尽量对齐。
