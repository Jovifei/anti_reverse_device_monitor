# Mongo 只读日志源接入说明

本系统从公司 Mongo **只读**拉取 `device_log_<productId>` 日志，展开 `data.<siid>_<piid>` 后写入本地 Prisma。现有 `/devices` **只按 SN 交互**；`device_id` 仅服务端注册表与同步使用，不出现在页面文案或搜索框。

## 安全

- 凭据仅放在本地 `.env.local` / `.env.docker`，勿提交仓库、勿写入前端。
- 适配器只使用 `find` / `distinct` / `ping` 等读命令，禁止写库。
- 聊天中出现过的密码应轮换。

## 固定品类（防逆流 CT）

默认 product_id：`689adc659f04ec32f7642fbb`  
默认集合：`device_log_689adc659f04ec32f7642fbb`  
（可用 `MONGODB_PRODUCT_ID` / `MONGODB_COLLECTION` 覆盖。）

联调设备（服务端注册表示例，页面只显示 SN）：

| SN | device_id（仅后台） |
|----|---------------------|
| GC2001000000252 | 69c4e61a495848939ee23928 |
| GC2001000000457 | 69c4e417495848939eb67a46 |

完整 SN↔device_id 映射表或查询网址后续接入；在此之前复制 `config/devices.example.json` → `config/devices.json`。

## 本地联调步骤

1. 复制 `.env.local.example` → `.env.local`，填写 `MONGODB_URI`、`MONGODB_DATABASE`，并设：

```text
SOURCE_DB_ENABLED=true
SOURCE_DB_TYPE=mongodb
```

2. `copy config\devices.example.json config\devices.json`
3. 命令：

```bash
npm run inspect:mongodb
npm run source:sync -- --dry-run --device-id 69c4e61a495848939ee23928
npm run source:sync -- --dry-run --device-id 69c4e417495848939eb67a46
npm run source:sync
npm run dev
```

浏览器打开 `/devices`，用 **SN**（如 `GC2001000000252`）进入详情。

## Docker（正式）

完整步骤与注意点见 [11_OPS_RUNBOOK.md §6](./11_OPS_RUNBOOK.md#6-docker-部署正式)。摘要：

```bash
copy .env.docker.example .env.docker
# 编辑密钥；SOURCE_DB_ENABLED=true；准备 config/devices.json
docker compose up --build -d
# 常驻增量（推荐）
docker compose --profile sync up -d sync
# 或一次性追数
docker compose --profile sync run --rm sync
```

- `app`：Web；`sync`：独立同步进程（与 Web 分离，推荐常驻）。
- ⚠️ 本开发机若未装 Docker，Compose 路径待环境验证。
- 调试也可：`docker compose exec app npm run source:sync -- --device-id …`

## 查询效率

应用侧强制：集合 + device_id + 时间窗分片 + limit/maxTimeMS。  
建议管理员索引（本应用不创建）：`{ device_id: 1, time: -1 }`。

## SIID / PIID 对照

防逆流 CT（本 product）属性哪些会进 Mongo 变更日志、哪些只能查 IoT 运行参数，以及监控 `metricKey` 映射，见：

- [CT_SIID_PIID_REPORTING.md](./CT_SIID_PIID_REPORTING.md)
