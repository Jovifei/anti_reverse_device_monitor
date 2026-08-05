# Docker 运维手册 — 生产与 Demo

> 适用范围：`anti_reverse_device_monitor_delivery_v1`（防逆流设备运行可视化系统）
> 配套文档：`docs/DOCKER_DEMO_DEPLOYMENT_REPORT.md`、`docs/DOCKER_PREDEPLOY_AUDIT.md`

---

## 0. 两套部署的区别

| 维度 | 生产（docker-compose.yml） | Demo（docker-compose.demo.yml） |
|------|---------------------------|----------------------------------|
| 项目名 | `anti_reverse_device_monitor_delivery_v1`（默认） | `anti-reverse-demo`（`-p`） |
| 数据源 | 读取 `.env.docker`（含 Mongo URI） | **不读取** `.env.docker` |
| Mongo 同步 | 可选（`SOURCE_DB_ENABLED` 由 env_file 提供） | `SOURCE_DB_ENABLED=false`，**不连 Mongo** |
| 数据卷 | `app-data`（→ `..._app-data`） | `demo-data`（→ `anti-reverse-demo_demo-data`） |
| 端口 | `${APP_BIND_HOST:-127.0.0.1}:${APP_PORT:-3102}:3000` | `127.0.0.1:3102:3000` |
| 种子 | 无（需真实同步或导入） | `demo-seed` 一次性生成 3 台 DEMO CT |
| 用途 | 正式只读观察 | 演示 / 验收 / 离线验证 |

---

## 1. Demo 部署（推荐用于验收）

### 构建
```bash
docker compose -p anti-reverse-demo -f docker-compose.demo.yml build
```

### 启动（含一次性种子）
```bash
docker compose -p anti-reverse-demo -f docker-compose.demo.yml up -d
```
- `demo-seed` 先跑（`restart: no`），应用 canonical migration 链并写入 3 台 DEMO CT（ONLINE/OFFLINE/REVERSE）+ ~14 万条遥测。
- `app` 等 `demo-seed` 成功完成后启动，监听 `127.0.0.1:3102`。

### 访问地址
- 总览：http://127.0.0.1:3102/devices
- 健康检查：http://127.0.0.1:3102/api/live
- 设备详情：
  - http://127.0.0.1:3102/devices/DEMO-CT-ONLINE-001
  - http://127.0.0.1:3102/devices/DEMO-CT-OFFLINE-002
  - http://127.0.0.1:3102/devices/DEMO-CT-REVERSE-003

### 查看日志
```bash
docker compose -p anti-reverse-demo -f docker-compose.demo.yml logs -f app
docker compose -p anti-reverse-demo -f docker-compose.demo.yml logs demo-seed
```

### 状态 / 健康检查
```bash
docker compose -p anti-reverse-demo -f docker-compose.demo.yml ps
# app 状态应为 Up ... (healthy)
```

### 停止（保留数据）
```bash
docker compose -p anti-reverse-demo -f docker-compose.demo.yml down
```
> ⚠️ **禁止** `docker compose ... down -v` —— `-v` 会删除 `demo-data` 数据卷，丢失所有 Demo 数据。

### 重启 / 重建（数据保留）
```bash
docker compose -p anti-reverse-demo -f docker-compose.demo.yml restart app
docker compose -p anti-reverse-demo -f docker-compose.demo.yml up -d --build app
```
> 以上操作均不删除数据卷，已验证数据在 restart / rebuild 后保持一致。

### 重新生成 Demo 数据
删除容器后再次 `up -d` 即可（`demo-seed` 每次都会清空并重建 `device-monitor.db`）：
```bash
docker compose -p anti-reverse-demo -f docker-compose.demo.yml down
docker compose -p anti-reverse-demo -f docker-compose.demo.yml up -d
```

---

## 2. 生产部署

### 前置
- 准备好 `.env.docker`（含 `MONGODB_URI` 等）。**切勿**将其提交到仓库。
- 确认 `node:22-bookworm-slim` 可拉取（或已缓存）。

### 启动 app
```bash
docker compose up -d
# 访问 http://127.0.0.1:3102/devices（端口可在 .env / 命令行覆盖 APP_PORT）
```

### 启动实时同步 worker（需 Mongo 已授权）
```bash
docker compose --profile sync up -d
```
- `sync` 服务 `depends_on app service_healthy`，共用 `app-data` 卷，不暴露端口。

### 停止（保留数据）
```bash
docker compose down        # 不要加 -v
```

---

## 3. Healthcheck 说明
- 探测：`node -e fetch('http://127.0.0.1:3000/api/live')`
- `/api/live` 为公开端点，查询最新同步检查点与设备上报时间，返回 200 JSON。
- 参数：interval 30s / timeout 8s / retries 3 / start_period 40s。

---

## 4. 数据卷位置
- 生产：`anti_reverse_device_monitor_delivery_v1_app-data` → 容器内 `/app/data/device-monitor.db`
- Demo：`anti-reverse-demo_demo-data` → 容器内 `/app/data/device-monitor.db`
- 两者完全独立，互不影响。

---

## 5. Mongo 当前状态（本轮 Demo 未启用）
- 认证成功（SCRAM-SHA-1 + directConnection）。
- `log` 库 `find` 仍返回 error 13（权限不足）——真实数据在 `zeico_cloud.device_log_689adc659f04ec32f7642fbb`。
- 因此 Demo 设置 `SOURCE_DB_ENABLED=false`，不启动 `sync`，不读取 Mongo 密码。
- Demo 成功 **不依赖** Mongo 授权；正式部署前需先解决 Mongo 只读权限。

---

## 6. 常见故障
- **app 无限重启 / `set: Illegal option -`**：容器入口脚本 `docker-entrypoint.sh` 必须为 **LF** 换行（CRLF 在 Linux 容器内会触发此错）。已在本轮修复。
- **端口占用 3102**：确认无其他项目占用；生产端口可用 `APP_PORT` 覆盖。
- **迁移失败**：确认 `prisma/migrations/` 五个目录齐全且 `migration_lock.toml` 存在；使用 `prisma migrate deploy`，不要用 `db push` 替代。
- **构建拉不到基础镜像**：确认 Docker 守护进程代理/镜像源可达；本轮未修改 `daemon.json`。
