# Docker 本机部署教程

本文面向 Windows + Docker Desktop，说明如何在本机启动防逆流设备监控，以及每个步骤背后的原理。

## 一、先理解部署原理

本项目不是“把 MongoDB 也装进 Docker”。MongoDB 仍然是外部公司的只读数据源，Docker 只运行本项目自己的 Web 和同步进程。

```text
外部 MongoDB（只读）
        │
        │ Mongo 只读查询
        ▼
sync 容器：source:worker
        │
        │ 写入本地 SQLite
        ▼
app-data Docker 数据卷：device-monitor.db
        │
        ▼
app 容器：Next.js production server
        │
        ▼
浏览器：http://127.0.0.1:3000/devices
```

### 两个服务的职责

| 服务 | 作用 | 是否写外部 MongoDB |
|---|---|---|
| `app` | 提供 Next.js 页面和 API；启动时执行 Prisma 迁移 | 否 |
| `sync` | 持续执行 `source:worker`，从 Mongo 增量拉取遥测并写入本地 SQLite | 否 |

两项数据写入边界不同：

- MongoDB：只读查询，不建索引、不更新、不删除。
- 本地 SQLite：由 `sync` 写入，存放在 Docker 的 `app-data` 卷中。
- 浏览器：只访问 `app`，不直接访问 MongoDB。

### SN、device_id 和 Mongo 查询的关系

IoT `getDevices` 返回的每台设备会合并为注册表记录，核心字段如下：

```json
{
  "device_id": "IoT 平台设备 ID",
  "sn": "设备 SN",
  "nickname": "设备名称",
  "product_id": "689adc659f04ec32f7642fbb",
  "collection": "device_log_689adc659f04ec32f7642fbb"
}
```

后续 Mongo 同步不是只按 SN 模糊搜索，而是使用注册表中的 `device_id` 分组查询对应日志集合；查询结果再写入 SQLite，页面只用 SN 和本地记录展示。因此一键启动必须先完成 IoT 注册表同步，再执行 `source:sync`。

## 二、部署前准备

### 步骤 1：进入仓库目录

在 PowerShell 执行：

```powershell
Set-Location 'E:\project\anti_reverse_device_monitor_delivery_v1'
```

确认 Docker Desktop 正常运行：

```powershell
docker version
docker compose version
```

### 步骤 2：创建 Docker 环境文件

只在文件不存在时复制模板：

```powershell
if (-not (Test-Path '.env.docker')) {
  Copy-Item '.env.docker.example' '.env.docker'
}
notepad '.env.docker'
```

至少确认以下配置：

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
```

如果还要通过 Web 的受保护接口刷新 IoT 注册表，再配置：

```dotenv
DREAM_MAKER_IOT_BASE_URL=https://iot.dream-maker.com
DREAM_MAKER_IOT_TOKEN=<IoT Bearer Token>
CRON_SECRET=<随机生成的接口密钥>
```

注意：

- `.env.docker` 已被 Git 忽略，不要提交。
- 上面已经填入当前项目已知的 Mongo 主机、数据库、产品和集合；只有用户名密码部分仍需保留在本机配置中。
- Mongo 用户名或密码中的 `$`、`*`、`@` 等特殊字符必须进行 URI 编码，例如 `$` 写成 `%24`，不要直接在命令行拼接。
- `MONGODB_DATABASE` 不能留空；它是日志查询的目标数据库。

### 步骤 3：验证 Compose 配置

使用 `--env-file .env.docker`，让 Compose 使用本机的 Docker 配置文件：

```powershell
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker --profile sync config --services
```

第二条命令应至少列出：

```text
app
sync
```

## 三、构建并启动服务

### 步骤 4：构建并启动 Web 服务

```powershell
docker compose --env-file .env.docker up --build -d app
```

发生的事情：

1. Docker 根据 `Dockerfile` 安装 Node 依赖。
2. 构建 Prisma Client 和 Next.js production bundle。
3. 创建 `app` 容器。
4. `scripts/docker-entrypoint.sh` 先执行 `prisma migrate deploy`。
5. 迁移完成后启动 `next start`，监听容器内 3000 端口。
6. Compose 将宿主机 3000 映射到容器 3000。

### 步骤 5：启动 Mongo 同步 Worker

```powershell
docker compose --env-file .env.docker --profile sync up -d sync
```

`sync` 使用与 `app` 相同的镜像和环境变量，但启动命令不同：

```text
npm run source:worker
```

它会按 checkpoint 增量查询 Mongo，并把展开后的遥测写入共享的 SQLite 文件。

## 四、验证是否部署成功

### 步骤 6：查看容器状态

```powershell
docker compose --env-file .env.docker --profile sync ps
```

正常应看到 `app` 和 `sync` 都是运行状态。

### 步骤 7：查看日志

```powershell
docker compose --env-file .env.docker logs --tail=100 app
docker compose --env-file .env.docker logs --tail=100 sync
```

重点观察：

- `app` 没有 Prisma migration error。
- `sync` 没有 Mongo authentication error。
- `sync` 能持续完成同步循环。

### 步骤 8：打开页面

```text
http://127.0.0.1:3000/devices
```

健康检查接口：

```powershell
Invoke-WebRequest -UseBasicParsing `
  -Uri 'http://127.0.0.1:3000/api/cron/sync-iot'
```

页面能打开只代表 `app` 正常；设备数据是否更新，还要同时确认 `sync` 日志正常。

## 五、手动刷新 IoT 注册表

Mongo 遥测同步由 `sync` 常驻执行；IoT 在线状态和设备注册表同步通过受保护的 POST 接口触发。

```powershell
$cronSecret = Read-Host '请输入 CRON_SECRET'
$headers = @{ Authorization = "Bearer $cronSecret" }

Invoke-WebRequest `
  -Method POST `
  -Uri 'http://127.0.0.1:3000/api/cron/sync-iot' `
  -Headers $headers

Remove-Variable cronSecret
```

接口含义：

- `GET`：只做存活检查，不执行同步。
- `POST`：校验 `CRON_SECRET` 后调用 IoT 注册表同步脚本。
- `401`：密钥错误。
- `503`：容器没有配置 `CRON_SECRET`。
- `500`：同步脚本执行失败，查看 `app` 日志。

## 六、数据卷和重启原理

Compose 定义了 `app-data` 和 `app-config` 两个 Docker volume，分别挂载到两个容器的 `/app/data` 与 `/app/config`：

```text
app-data:/app/data
app-config:/app/config
```

因此：

- 重启容器不会删除本地 SQLite 数据。
- `docker compose up -d` 可以安全地重新创建容器。
- 不要随意执行 `docker compose down -v`，因为 `-v` 会删除 `app-data` 和 `app-config` 数据卷。

首次创建 `app-config` 卷时，Docker 会用镜像中的 `config/` 初始内容填充它；之后 IoT 同步写入的注册表会在重建/重启容器后保留。

## 七、日常操作

### 本地 Node 一键启动（不使用 Docker）

如果希望由脚本完成“拉取 IoT 设备 → 保存 SN/device_id 映射 → 按 device_id 拉 Mongo → 启动 Worker 和 Web”，在仓库根目录执行：

```powershell
./start-monitor.cmd
```

或在 PowerShell 中执行：

```powershell
./start-monitor.ps1
```

Git Bash / Linux / macOS 使用：

```bash
bash ./start-monitor.sh
```

三个入口执行的核心顺序相同：

1. 检查 `.env.local`、Node.js 和依赖。
2. 执行 SQLite Prisma 迁移。
3. 调用 IoT `getDevices`，把 `SN ↔ device_id ↔ nickname` 写入 `config/devices.json`。
4. 使用注册表中的 `device_id` 从 Mongo 读取遥测，并写入本地 SQLite。
5. 启动常驻 `source:worker`，再启动 Web 页面。

IoT 拉取失败会中止后续 Mongo 同步，避免使用过期注册表误同步；脚本默认不删除 IoT 列表之外的历史映射。

### 查看实时日志

```powershell
docker compose --env-file .env.docker logs -f app
docker compose --env-file .env.docker logs -f sync
```

### 更新代码后重新部署

```powershell
git pull
docker compose --env-file .env.docker up --build -d app
docker compose --env-file .env.docker --profile sync up --build -d sync
```

### 停止服务但保留数据

```powershell
docker compose --env-file .env.docker stop app sync
```

### 重新启动服务

```powershell
docker compose --env-file .env.docker start app sync
```

## 八、常见问题

### 1. 页面打不开

```powershell
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail=100 app
```

确认访问的是 `3000` 端口，而不是开发环境的 `3102`。

### 2. 页面能打开但没有新数据

```powershell
docker compose --env-file .env.docker logs --tail=200 sync
```

重点检查：

- `SOURCE_DB_ENABLED=true`。
- `MONGODB_DATABASE` 不为空。
- URI 中的密码特殊字符已经编码。
- Mongo 只读账号仍有访问权限。
- Docker Desktop 能访问 Mongo 代理地址。

### 3. `sync` 容器反复退出

先查看完整错误：

```powershell
docker compose --env-file .env.docker logs sync
```

认证、超时、权限问题都应先修复配置后再重启，不要通过给 Mongo 账号增加写权限来绕过问题。

### 4. 重启后设备注册表回到旧版本

如果注册表没有更新，检查 `app-config` 卷是否挂载、IoT Token 是否有效，以及 `sync` 日志中的 `devices:sync-iot` 结果。

## 九、安全检查

部署前确认：

- `.env.docker` 没有被 Git 跟踪。
- Mongo 账号只有读权限。
- Token、URI、密码没有出现在镜像、日志、截图或 Git 提交中。
- 不执行 `docker compose down -v`，除非已经备份并确认可以删除本地 SQLite 数据。
