# 部署与配置指南

本文是当前版本的可执行入口。真实 Mongo URI、IoT Token、`CRON_SECRET`、设备 `SN/device_id` 映射只保存在本机环境或部署平台密钥管理器中，不写入仓库。

## 1. 环境要求

- Windows 本地：Node.js 22 LTS、npm、PowerShell 5.1+。
- 正式部署：Docker Desktop（Compose v2）或可运行 Node.js 22 的服务器。
- MongoDB 使用只读账号；应用不执行写库、建索引、控制设备或 OTA。

## 2. Windows 本地配置

在仓库根目录执行：

```powershell
Copy-Item .env.local.example .env.local
npm install
```

编辑 `.env.local`，至少设置：

```dotenv
APP_TIMEZONE=Asia/Shanghai
SOURCE_DB_ENABLED=true
SOURCE_DB_TYPE=mongodb
MONGODB_URI=mongodb://zeicomongo:<PASSWORD>@proxy.zeico.cn:3718/zeico_cloud?authSource=zeico_cloud
MONGODB_DATABASE=zeico_cloud
MONGODB_PRODUCT_ID=689adc659f04ec32f7642fbb
MONGODB_COLLECTION=device_log_689adc659f04ec32f7642fbb
MONGODB_DIRECT_CONNECTION=true
MONGODB_AUTH_MECHANISM=SCRAM-SHA-1
DREAM_MAKER_IOT_BASE_URL=https://iot.dream-maker.com
DREAM_MAKER_IOT_TOKEN=<IoT Bearer Token>
```

上面的主机、数据库、产品和集合已经按当前项目配置填好；只有密码和 IoT Token 仍需在本机填写。如果密码包含 `$`、`&` 或 `@`，不要在 PowerShell 命令行中直接拼接 URI；把完整值写入 `.env.local`，并按 Mongo URI 规则对用户名/密码进行 URL 编码。不要把真实值粘贴到 README、Issue 或 Git 提交中。

| 变量 | 用途 |
|---|---|
| `APP_DATABASE_URL` | 本地 SQLite 路径 |
| `SOURCE_DB_ENABLED` / `SOURCE_DB_TYPE` | 开启 Mongo 只读同步 |
| `MONGODB_URI` / `MONGODB_DATABASE` | Mongo 连接与日志数据库 |
| `MONGODB_COLLECTION` / `MONGODB_PRODUCT_ID` | 可选集合或品类覆盖 |
| `DREAM_MAKER_IOT_TOKEN` | 拉取设备注册表和在线状态 |
| `CRON_SECRET` | 保护 `POST /api/cron/sync-iot` |

## 3. 首次同步与启动

```powershell
npm run inspect:mongodb
npm run devices:sync-iot -- --dry-run
npm run devices:sync-iot
npm run db:ensure-migrations
npm run source:sync
npm run source:worker   # 保持此窗口运行
npm run dev -- --hostname 127.0.0.1 --port 3000
```

浏览器打开 `http://127.0.0.1:3000/devices`。也可以直接运行 `start-monitor.cmd`，它会依次执行迁移、注册表同步、Mongo 增量同步、Worker 和 Web 启动。

Git Bash / Linux / macOS 可执行 `bash ./start-monitor.sh`，执行顺序与 `start-monitor.cmd` 相同。

## 4. 日常同步与 Windows 计划任务

- Mongo 遥测：`npm run source:worker`，使用 checkpoint 做增量同步。
- IoT 注册表：`npm run devices:sync-iot`，更新本地 `config/devices.json`。
- 每日任务使用 `sync-iot-daily.cmd`，不要把 `start-monitor.cmd` 当作定时任务。

注册任务时使用本机绝对路径：

```powershell
schtasks /Create /TN "AntiReverse_IoT_DailySync" /TR "<repo>\sync-iot-daily.cmd" /SC DAILY /ST 00:00 /RL HIGHEST
```

## 5. Docker 部署

```powershell
Copy-Item .env.docker.example .env.docker
docker compose --env-file .env.docker up --build -d app
docker compose --env-file .env.docker --profile sync up -d sync
docker compose --env-file .env.docker --profile sync ps
docker compose --env-file .env.docker logs --tail=100 app
docker compose --env-file .env.docker logs --tail=100 sync
```

- `app` 提供 Web，默认映射到 `http://127.0.0.1:3000`。
- `sync` 运行 `source:worker`，与 Web 共享 `app-data` SQLite 卷。
- Mongo URI、Token、`CRON_SECRET` 只从 `.env.docker` 注入，不进入镜像。
- `config/devices.json` 在构建时复制进镜像；容器内更新注册表需要重新构建或显式配置受控卷。

## 6. Cron 接口

存活检查：

```powershell
Invoke-WebRequest http://127.0.0.1:3000/api/cron/sync-iot
```

触发同步：

```powershell
$headers = @{ Authorization = "Bearer $env:CRON_SECRET" }
Invoke-WebRequest -Method POST -Uri http://127.0.0.1:3000/api/cron/sync-iot -Headers $headers
```

`GET` 用于存活探针；`POST` 才执行同步。缺少 `CRON_SECRET` 返回 503，凭据不匹配返回 401。

## 7. 发布验证与排障

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

| 现象 | 检查 |
|---|---|
| 页面打不开 | 确认 Web/容器正在运行，并访问实际端口 |
| Mongo 认证失败 | 检查 `authSource`、只读权限、`directConnection`、认证机制和 URI 编码 |
| 页面无设备 | 检查 `config/devices.json`、IoT Token、`SOURCE_DB_ENABLED` 和同步日志 |
| 同步很慢 | 缩小设备/时间窗口，不要并行启动多个 Worker |
| 页面数据未刷新 | 确认 Worker 正常运行，再点击“刷新数据”，并检查 `/api/live` |
| Docker 重启后数据丢失 | 检查 `app-data` 卷；注册表文件需单独持久化 |

## 8. 安全检查清单

- [ ] `.env.local`、`.env.docker` 未被 Git 跟踪。
- [ ] Mongo 账号只有读权限。
- [ ] IoT Token 和 `CRON_SECRET` 未出现在日志、截图、Issue 或提交中。
- [ ] 运行日志、本地 SQLite、设备原始映射未被加入提交。
- [ ] 推送前执行 `git diff --cached --check` 和敏感信息扫描。
