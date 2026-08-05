# Docker Demo 部署验证报告 — DOCKER_DEMO_DEPLOYMENT_VALIDATION

> 执行时间：2026-08-05 (GMT+8)
> 分支：`codex/docker-demo-deployment` (基于 `origin/main` = `2385d07`)
> 结论：**DOCKER_DEMO_STATUS = PASS**

---

## 1. 分支与 HEAD
- 分支：`codex/docker-demo-deployment`（本轮新建，保留全部工作区改动；未推送、未合并）
- HEAD：`2385d07e353a3d8729d8471a15da83ea59eb1730`
- 远端 origin/main：`2385d07e353a3d8729d8471a15da83ea59eb1730`（一致）

## 2. 初始工作树状态
- 已修改（8）：`Dockerfile`, `app/devices/page.tsx`, `docker-compose.yml`, `package-lock.json`, `package.json`, `scripts/rebuild-offline-review-from-static.ts`, `src/domain/faults.ts`, `tests/unit/metric-match.test.ts`
- 未跟踪：`prisma/migrations/0001_init`, `0002_add_inverter_phase_num`, `0003_source_sync_audit`, `migration_lock.toml`（canonical 链 0001→0005，0004/0005 已跟踪）、`docs/DOCKER_PREDEPLOY_AUDIT.md`、`.workbuddy/`(本地记忆，不提交)

## 3. Docker 版本
- `docker version`：Client & Server 29.6.2 (Docker Desktop 4.85.0)
- `docker compose version`：v5.3.1

## 4. Compose 版本
- Docker Compose v5.3.1（内置于 Docker Desktop）

## 5. Docker 网络 Gate
- **DOCKER_NETWORK_GATE = PASS**
- `node:22-bookworm-slim` 已缓存（sha256:d649c27…，~80MB）
- 复验 `docker pull node:22-bookworm-slim` → `Status: Image is up to date`（PULL_RC=0）
- 本轮**未修改** `daemon.json` / Docker Desktop 代理 / Windows 系统代理，未重启 Docker，未硬编码代理地址。

## 6. 本地代码修复审计（真实退出码）
| 检查 | 命令 | RC | 结论 |
|------|------|----|------|
| 依赖安装 | `npm ci` | 0 | 400 packages |
| Prisma 生成 | `npm run prisma:generate` | 0 | Client v5.22.0（prisma / @prisma/client 一致）|
| 类型检查 | `npm run typecheck` | 0 | tsc --noEmit 0 错误 |
| 代码规范 | `npm run lint` | 0 | eslint 干净 |
| 单元测试 | `npm run test` (unit) | 0 | 29 文件 / 120 用例通过 |
| 集成测试 | `npm run test` (integration) | 0 | status=pass |

候选修复逐项确认：
1. `fleetListHref` 返回 `UrlObject` 满足 `typedRoutes` → typecheck 通过证实
2. `@types/react-dom` 补依赖 → typecheck/lint 通过
3. 测试 fixture 补 `reportedAt` → 120 用例通过
4. `inverterGenerationLabel` 字段补齐 → 编译通过
5. `eventType` 可选类型 → typecheck 通过
6. 端口 3000 → 3102（主机 3000 被 Grafana 占用）

## 7. Prisma migration 结果
- 链 0001_init → 0002 → 0003 → 0004 → 0005 连续，无缺号。
- 0001–0003 为未跟踪（canonical，本轮纳入提交）；0004/0005 已跟踪。
- 全部迁移 SQL 为 schema DDL，**无密钥、无 Mongo URI、无密码**。
- 仓库外空库 `migrate deploy`：RC=0，14 张表创建，Prisma 查询 RC=0。
- 中间态库（仅 0001–0003）→ 升级到全量：RC=0，查询 RC=0。
- 幂等复验：`No pending migrations to apply.` RC=0。
- 未使用 `prisma db push` 替代正式迁移。

## 8. Dockerfile 审计
- `npm ci` 使用 `package-lock.json` ✓
- `prisma generate` 在 `next build` 之前（`RUN npx prisma generate && npm run build`）✓
- 运行镜像包含：`.next`, `public`, `prisma`(含 migrations), `scripts`, `src`, `config` ✓
- `.dockerignore` 已补充排除 `log`, `ui-preview-real-logs.html`（原有 `node_modules/.next/.git/.env*/data/artifacts` 等）✓
- 镜像**不包含** Mongo URI（运行时经 env_file 注入）✓
- 代理为**参数化 ARG**（无默认值、非 7890/3128 硬编码），符合“不硬编码代理”✓
- 未修改用户 `daemon.json` ✓

## 9. 生产 Compose 修改（`docker-compose.yml`）
- 端口：`${APP_BIND_HOST:-127.0.0.1}:${APP_PORT:-3102}:3000`
- 保留 `restart: unless-stopped`；新增 `init: true`、`stop_grace_period: 30s`
- 新增 healthcheck：`node -e fetch('http://127.0.0.1:3000/api/live')`（interval 30s / timeout 8s / retries 3 / start_period 40s）
- `app` 与 `sync` 均加日志轮转：`json-file`, `max-size 10m`, `max-file 3`
- 修复 env 重复定义：`SOURCE_*`/`MONGODB_*` 仅由 `env_file: .env.docker` 提供，`environment` 仅保留未被 env_file 定义的 `APP_DATABASE_URL`，避免 `${SOURCE_DB_ENABLED:-false}` 错误覆盖 `.env.docker`
- `sync`：无暴露端口、共用 `app-data`、`depends_on app service_healthy`、`restart unless-stopped`、`init true`（本轮不启动，走 `profile: sync`）

## 10. Demo Compose 设计（`docker-compose.demo.yml`）
- 项目名 `anti-reverse-demo`（`-p`），**不读取** `.env.docker`、不含 `MONGODB_URI`、不连接 Mongo
- `SOURCE_DB_ENABLED=false`
- 独立命名卷 `demo-data`（→ `anti-reverse-demo_demo-data`），与生产 `app-data` 完全隔离
- 绑定 `127.0.0.1:3102:3000`
- `demo-seed`：同一镜像、覆盖 entrypoint 直跑 `npm run demo:seed`、`DEMO_DATABASE_FILE=device-monitor.db`、`DEMO_USE_MIGRATIONS=true`、`restart: "no"`（只跑一次，自带 `prisma migrate deploy`）
- `app`：`depends_on demo-seed service_completed_successfully`、healthcheck、日志轮转
- 禁止对正式 `app-data` 执行 `demo:seed`、禁止读取真实 Mongo 密码

## 11. 镜像构建结果
- `BUILD_RC=0`，镜像 `anti-reverse-demo:local`
- 基础镜像 `node:22-bookworm-slim`（缓存）；`npm ci` / `apt-get`(openssl) / `prisma generate` / `next build` 均成功
- 最终镜像大小：**≈ 371.3 MiB (0.36 GiB)**
- **修复一个真实的容器启动缺陷**：`scripts/docker-entrypoint.sh` 原以 CRLF（Windows）换行提交，在 Linux 容器内 `set -eu\r` 触发 `Illegal option -` 导致 `app` 无限重启；已转为 LF 并重新构建（仅影响运行容器，不影响构建）。

## 12. demo-seed 结果
- 退出码 **0**，日志：`All migrations have been successfully applied.` + `{"status":"pass","devices":["DEMO-CT-ONLINE-001","DEMO-CT-OFFLINE-002","DEMO-CT-REVERSE-003"],"telemetryRows":140272}`

## 13. app 容器状态
- `Up (healthy)`，`127.0.0.1:3102->3000/tcp`
- 入口：`prisma migrate deploy`（No pending migrations）→ `next start`（Ready 163ms）

## 14. healthcheck
- `Health=healthy`（start_period 40s 内达标）

## 15. HTTP 页面验证
| 路径 | HTTP |
|------|------|
| `/api/live` | 200（JSON：`lastReportedAt` 有效，`syncedAt/status=null` 符合无 Mongo 预期）|
| `/devices` | 200（三台 DEMO CT 均出现）|
| `/devices/DEMO-CT-ONLINE-001` | 200（含 DEMO-MI-A01…A06 微逆卡片）|
| `/devices/DEMO-CT-OFFLINE-002` | 200（离线场景：离线/Offline 文案）|
| `/devices/DEMO-CT-REVERSE-003` | 200（逆流场景：逆流/Reverse 文案）|

- 无真实 `undefined`/`NaN` 渲染（页面中的 `$undefined` 均为 Next.js RSC 序列化占位符，非可见数据）
- 故障 / 离线区间 区块随 seeded 数据客户端渲染

## 16. SQLite 持久化
- 基准：telemetry=140272 / device=3 / inverter=9 / reverseFlowAlert=3 / faultEvent=0
- `restart app` 后：telemetry=140272 / device=3 / reverseFlowAlert=3（一致）
- `up -d --build app` 后：telemetry=140272 / device=3 / reverseFlowAlert=3（一致）
- 卷 `anti-reverse-demo_demo-data` 始终存在（从未执行 `down -v`）

## 17. 重启结果
- `restart app` → 45s 后 `healthy`，数据保留，页面 200 ✓

## 18. 重建结果
- `up -d --build app` → 重建镜像、重建容器，卷未删除，数据一致，页面 200 ✓

## 19. Mongo 是否被访问
- **否**。Demo 设置 `SOURCE_DB_ENABLED=false`，Compose 未读取 `.env.docker`、不含 `MONGODB_URI`，未启动 `sync`。`/api/live` 返回 `status:null`。

## 20. 修改文件
`Dockerfile`, `app/devices/page.tsx`, `docker-compose.yml`, `package-lock.json`, `package.json`, `scripts/rebuild-offline-review-from-static.ts`, `src/domain/faults.ts`, `tests/unit/metric-match.test.ts`, `scripts/docker-entrypoint.sh`(CRLF→LF), `.dockerignore`

## 21. 新增文件
`docker-compose.demo.yml`, `docs/DOCKER_PREDEPLOY_AUDIT.md`, `docs/DOCKER_DEMO_DEPLOYMENT_REPORT.md`, `docs/DOCKER_OPERATIONS.md`, `prisma/migrations/0001_init`, `prisma/migrations/0002_add_inverter_phase_num`, `prisma/migrations/0003_source_sync_audit`, `prisma/migrations/migration_lock.toml`

## 22. 验证命令与退出码
- `npm ci` 0 / `prisma:generate` 0 / `typecheck` 0 / `lint` 0 / `test` 0
- `git diff --check` 0
- `docker compose config` 0 / `docker compose -p anti-reverse-demo -f docker-compose.demo.yml config` 0
- `docker compose -p anti-reverse-demo -f docker-compose.demo.yml build` 0
- `docker compose -p anti-reverse-demo -f docker-compose.demo.yml ps` healthy

## 23. 本地提交
- 提交到 `codex/docker-demo-deployment`，信息：`feat: validate isolated Docker demo deployment`
- **不推送、不合并**

## 24. 是否推送或合并
- **否**。仅本地提交。

## 25. 下一阶段正式部署前置条件
1. **Mongo 授权**：当前认证成功（SCRAM-SHA-1 + directConnection），但 `log` 库 `find` 仍返回 error 13；需 DBA 授予只读角色或提供正确的 `MONGODB_COLLECTION`（真实数据所在集合 `zeico_cloud.device_log_689adc659f04ec32f7642fbb`）。
2. **真实字段映射核对**：工作状态 SIID、Inv5/6 前缀、发电量单位、微逆 SN/版本/相位导出字段确认。
3. **二期真实联调**：真实属性同步、多设备验收、压力/延迟基线未跑。
4. **生产 Compose 启用 sync**：`docker compose --profile sync up -d`（需先满足 1–3）。
5. 部署镜像建议改用 `next build` standalone 输出并拆分 web/worker（本轮未做，后续优化）。
