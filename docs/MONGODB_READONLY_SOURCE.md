# Mongo 只读日志源接入说明

本系统从公司 Mongo **只读**拉取 `device_log_<productId>` 日志，展开 `data.<siid>_<piid>` 后写入本地 Prisma。现有 `/devices` **只按 SN 交互**；`device_id` 仅服务端注册表与同步使用，不出现在页面文案或搜索框。

## 安全

- 凭据仅放在本地 `.env.local` / `.env.docker`，勿提交仓库、勿写入前端。
- 适配器只使用 `find` / `distinct` / `ping` 等读命令，禁止写库。
- 聊天中出现过的密码应轮换。

## 固定品类（防逆流 CT）

默认 product_id / collection 通过 `.env.local` 配置；本文不记录真实产品 ID、集合名、SN 或 `device_id` 映射。页面仍只按 SN 交互，不展示 `device_id`。

本地缺 `devices.json` 时会回退读取 `devices.example.json`；一键脚本也会自动从 example 播种。

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
npm run source:sync -- --dry-run --device-id <approved_device_id>
npm run source:sync
npm run dev
```

浏览器打开 `/devices`，用已授权的 **SN** 进入详情。

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
