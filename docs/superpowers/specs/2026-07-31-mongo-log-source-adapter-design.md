---
comet_change: mongo-log-source-adapter
role: technical-design
canonical_spec: openspec
---

# Mongo 日志只读接入 — 技术设计

## 1. 背景与范围

防逆流 CT 监控需从公司 Mongo 只读拉取 `device_log_*` 日志，展开后写入本地 Prisma，复用现有 `/devices` 页面。最终以 Docker 部署应用；公司 Mongo 保持外部只读依赖。

**范围内**

- Node/Next 只读 Adapter + 现有 `SourceSyncService`
- 设备注册表（SN ↔ device_id）；品类默认写死
- 调试手动 sync；正式 Compose 独立 sync
- 应用侧 Docker（app + sync profile）

**范围外**

- Python 独立服务、梦创 IoT Web 爬取、对 Mongo 写/建索引、新业务页面、控制/OTA/MQTT

## 2. 固定身份约定

人工只看 SN；`device_id` 仅后台查询使用。

| SN | device_id |
|----|-----------|
| `GC2001000000252` | `69c4e61a495848939ee23928` |
| `GC2001000000457` | `69c4e417495848939eb67a46` |

- 品类（防逆流 CT）product_id：**默认写死** `689adc659f04ec32f7642fbb`
- 集合：`device_log_689adc659f04ec32f7642fbb`（可用 `MONGODB_COLLECTION` 覆盖）

## 3. 架构

```text
Mongo (external, read-only)
  device_log_<productId>
        │ find: device_id + time window (sharded)
        ▼
MongoLogSourceAdapter
  + device-registry (SN map)
  + mongo-field-mapping / expand-device-log
        ▼
SourceSyncService → Prisma SQLite (data/)
        ▼
Existing /devices UI (no Mongo credentials in browser)
```

**同步触发**

- 调试：宿主机或 `docker compose exec` 跑 `npm run source:sync`
- 正式：Compose `sync` 服务/profile，与 `app`（`next start`）生命周期分离

## 4. 组件设计

| 组件 | 职责 | 依赖 |
|------|------|------|
| `CT_PRODUCT_ID` 默认常量 | env 未设时回落品类 ID | 无 |
| `device-registry` | 加载 `config/devices.json`；占位 SN；集合推导 | 文件系统 |
| `mongo-field-mapping` | `data` 键 → metricKey/siid/piid | JSON 配置 |
| `expand-device-log` | 单文档展开为多条 `SourceTelemetryRecord`；附带 `sourceDeviceId` | mapping |
| `MongoLogSourceAdapter` | 只读连接、分片查询、health | mongodb 驱动 |
| `SourceSyncService` | upsert Device（productModel=device_id）、telemetry、checkpoint | Prisma |
| CLI | `source:sync`、`devices:sync-registry`、`inspect:mongodb` | Adapter |
| UI identity helpers | 主显示 SN；副显示 device_id / 占位说明 | registry 结果 |

**查询分片（应用侧）**

1. 集合：product 默认或显式 collection  
2. 设备：注册表 device_id 集合或 `--device-id`  
3. 时间：lookback + 6h 子窗  
4. `limit` + `maxTimeMS`；禁止无过滤全表扫  

**只读约束：** 代码路径不得 `insert`/`update`/`delete`/`createIndex`。

## 5. Docker 部署

- 多阶段构建：`npm ci` → `prisma generate` → `next build` → 运行 `next start`
- 同镜像入口：`app` vs `npm run source:sync`
- 挂载：`data/`、`config/devices.json`
- 密钥：compose `env_file` / secrets；`.dockerignore` 排除 `.env.local`
- 不包含 Mongo 容器副本

## 6. 错误与边界

- 缺 URI/库名：立即失败，明确错误信息  
- 超时/网络：sync batch failed + checkpoint；不写源库  
- 未映射 `data` 键：跳过并计 `unknownMetrics`  
- 无 SN：占位 `unknown-<prefix>`，UI 优先展示 device_id  

## 7. 测试策略

- 单元：展开、注册表、占位 SN、时间分片、品类默认（fixture，无真库）  
- 联调：两台固定 SN dry-run → sync → `/devices`  
- Docker：compose 起 app；手动或 `--profile sync`；确认镜像层无密码  

## 8. 实现状态与剩余工作

Adapter / sync 接线 / UI 回退 / 基础单测与只读文档已在仓库。Design 确认后 build 剩余重点：

1. 品类默认常量与 `devices.example.json` 写入两台真实 SN 映射  
2. Dockerfile、compose、`.dockerignore`、部署文档  
3. Spec/文档与联调清单对齐  

## 9. Spec 对齐

Canonical requirements 见 `openspec/changes/mongo-log-source-adapter/specs/mongo-log-readonly-source/spec.md`（含固定身份与 Docker sync 验收场景）。
