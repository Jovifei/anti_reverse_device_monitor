# Docker Demo 环境部署 — 验收报告

**DOCKER_DEMO_STATUS: PASS**

- 部署分支：`feature/20260807/iot-registry-daily-sync`
- 部署 commit：`420834d`（已 push 到 `origin/feature/20260807/iot-registry-daily-sync`）
- 验收时间（UTC）：2026-08-08T09:20:36Z
- seed 完成时间（UTC）：2026-08-08T09:18:37Z（页面验收在 seed 后约 2 分钟内完成，处于 15 分钟在线窗口内）
- Compose 项目名：`anti-reverse-demo`（隔离卷 `anti-reverse-demo_demo-data`，不影响生产 `app-data`）
- 访问地址：`http://127.0.0.1:3102`

> 红线全部遵守：**未连接 MongoDB**（容器内无任何 `MONGODB_*` 环境变量、`SOURCE_DB_ENABLED=false`、demo compose 不读取 `.env.docker`）；**未启动 sync worker**（未使用 `--profile sync`，未运行 `source:sync`/`source:worker`/`resync-all`）；**未修改 Mongo 配置**；**未触碰生产 compose 卷**。

---

## 1. 镜像构建结果 — PASS

| 项 | 结果 |
|---|---|
| 命令 | `docker compose -p anti-reverse-demo -f docker-compose.demo.yml build --no-cache` |
| 退出码 | 0 |
| 镜像 | `anti-reverse-demo:local`（app 与 demo-seed 两 stage 均基于同一镜像构建） |
| `--no-cache` | 已使用，避免复用 41 小时前的旧镜像（旧镜像含旧代码/旧迁移校验和） |
| `config/` 入镜像 | 已确认 `COPY --from=builder /app/config ./config`，`devices.demo.json` 在镜像内 `/app/config/devices.demo.json` |

构建前已解除构建阻断：`npx tsc --noEmit --incremental false` 退出 0（从 `codex/docker-demo-deployment` 按文件移植 `src/domain/faults.ts` 与 `tests/unit/metric-match.test.ts` 的纯加法类型修复）。

## 2. 容器状态 — PASS

| 容器 | 状态 | 说明 |
|---|---|---|
| `anti-reverse-demo-demo-seed-1` | Exited(0) | seed 一次执行成功（`restart: "no"`），写入 3 台设备 + 140,272 行遥测 |
| `anti-reverse-demo-app-1` | Up / healthy | 端口 `127.0.0.1:3102->3000` |

## 3. 健康检查 — PASS

- `docker inspect` → `State.Health.Status = healthy`
- `/api/live` → HTTP 200
- `demo-seed` 日志末行：`{"status":"pass","database":"data/device-monitor.db","devices":["DEMO-CT-ONLINE-001","DEMO-CT-OFFLINE-002","DEMO-CT-REVERSE-003"],"telemetryRows":140272}`
- 迁移链 `0001_init → 0005_align_device_latest_index` 全部应用成功（无 P3009 校验和冲突；`down -v` 已清旧卷）

## 4. 页面访问 — PASS（验证在 15 分钟在线窗口内）

| # | 路由 | HTTP | 校验 |
|---|---|---|---|
| 1 | `/devices` | 200 | 列表恰好 3 行，均为 DEMO SN（ONLINE 在线 / OFFLINE 离线 / REVERSE 逆流告警） |
| 2 | `/devices/DEMO-CT-ONLINE-001` | 200 | 功率总览/负载/发电曲线标记存在（chart/功率/负载） |
| 3 | `/devices/DEMO-CT-OFFLINE-002` | 200 | 离线设备页可访问 |
| 4 | `/devices/DEMO-CT-REVERSE-003` | 200 | 逆流告警内容存在（28 处「逆流」、6 处 reverse 标记） |
| 5 | `/devices/DEMO-CT-ONLINE-001/inverters/1` | 200 | 微逆详情含 PV1/PV2/温度（inverter/PV1/PV2/温度标记） |
| 6 | `/api/devices?page=1&pageSize=10` | 200 | JSON 含 3 台，`isOnline`/`reverseFlow` 符合预期 |

**API summary（KPI）符合预期：**
```
registryTotal=3  activeTotal=3  onlineCtCount=2  offlineCtCount=1
criticalReverseFlowCount=1  staleOfflineCount=0
```

> 验证方式说明：本环境为无 GUI 的 agent 运行时，采用 `curl` + 内容/JSON 断言替代 GUI 截图存证（HTTP 200 + 关键字/字段断言）。若需可视化截图，可在本地浏览器打开 `http://127.0.0.1:3102/devices` 查看。

## 5. 数据持久化 — PASS

- 重启 `app` 后重新访问 `/api/devices` 仍返回 3 台设备且 flag 不变（`total=3`，online/reverse 与 seed 一致）。
- SQLite 文件 `/app/data/device-monitor.db` 体积 52 MB，mtime 为 seed 时刻（09:18），**重启未触发重播种**，遥测数据保留。
- 卷 `anti-reverse-demo_demo-data`（Driver=local）持久化生效。
- 注：重启不重播种，设备将在超过 15 分钟窗口后转为离线——此为预期行为，仅验证「数据仍在」。

## 6. 修改文件清单（commit `420834d`）

**新增**
- `config/devices.demo.json`（3 台 DEMO 设备注册表，未改动 372 台生产 `config/devices.json`）
- `docker-compose.demo.yml`（从 `codex/docker-demo-deployment` 移植 + `app` service 注入 `DEVICES_REGISTRY_PATH`）
- `.gitattributes`（`*.sh text eol=lf`，防 CRLF 回归）
- `prisma/migrations/0001_init/migration.sql`
- `prisma/migrations/0002_add_inverter_phase_num/migration.sql`
- `prisma/migrations/0003_source_sync_audit/migration.sql`
- `prisma/migrations/migration_lock.toml`

**修改**
- `src/domain/faults.ts`（参数类型加 `eventType?: string`，纯加法）
- `tests/unit/metric-match.test.ts`（补 `reportedAt`，纯加法）
- `Dockerfile`（仅新增 `HTTP_PROXY/HTTPS_PROXY/NO_PROXY` build args）
- `.dockerignore`（仅新增 `log`、`ui-preview-real-logs.html` 两行）

**明确未动（红线）**
- `config/devices.json`（372 台生产注册表）
- `docker-compose.yml`（生产 compose，含 Mongo 配置）
- `.env.docker` / `.env.local`
- `app/`、`src/services/`、`src/adapters/` 业务逻辑

## 7. commit 与 push 状态

- commit：`420834d feat(docker): port validated demo stack to iot branch + demo device registry`（12 files changed, +312/-6）
- push：已直接 `git push` 到 `feature/20260807/iot-registry-daily-sync`（`e80477b..420834d`），未建 PR、未用 gh。

---

## 一键重播种（如需刷新在线状态）

```bash
docker compose -p anti-reverse-demo -f docker-compose.demo.yml run --rm demo-seed && \
docker compose -p anti-reverse-demo -f docker-compose.demo.yml restart app
```

> 重播种后须在 **15 分钟内**完成页面验收（在线判定窗口 `OFFLINE_THRESHOLD_MINUTES=15`）。
