# Docker 预部署审计 — DOCKER_DEMO_DEPLOYMENT_VALIDATION

> 生成时间：2026-08-05 23:47 (GMT+8)
> 任务分支：`codex/docker-demo-deployment`
> 审计阶段：冻结工作区 + 代码/镜像/migration 审查（构建前）

## 1. 分支与 HEAD

| 项 | 值 |
|----|----|
| 当前分支 | `codex/docker-demo-deployment` |
| HEAD | `2385d07e353a3d8729d8471a15da83ea59eb1730` |
| 远端 origin/main | `2385d07e353a3d8729d8471a15da83ea59eb1730` |
| 本地已有分支 | `main`, `codex/fix-main-regressions`, `codex/phase2-ui-acceptance` |
| 分支是否已存在 | 否（本次新建，保留全部工作区改动） |

> 说明：原在 `main`，`git checkout codex/docker-demo-deployment` 后工作树完整保留，未做任何 reset/stash/restore。

## 2. 已修改文件（git diff --name-status，共 8 个）

| 状态 | 文件 | 说明 |
|------|------|------|
| M | `Dockerfile` | 构建阶段注入代理 ARG/ENV（仅构建期；待收口确认为无害/移除本机代理） |
| M | `app/devices/page.tsx` | `fleetListHref()` 返回 `UrlObject` 以满足 `typedRoutes` |
| M | `docker-compose.yml` | 端口 3000 → 3102（主机 3000 被 Grafana 占用） |
| M | `package-lock.json` | npm install 触发（@prisma/client 5.22.0 等） |
| M | `package.json` | 增加 `@types/react-dom` devDependency |
| M | `scripts/rebuild-offline-review-from-static.ts` | 补齐 `inverterGenerationLabel` 字段 |
| M | `src/domain/faults.ts` | `hadRecentReportableInverterFault` 参数增加 `eventType?` |
| M | `tests/unit/metric-match.test.ts` | 测试 fixture 补 `reportedAt` |

`git diff --check` 通过（无空白/冲突标记）。

## 3. 未跟踪文件（git ls-files --others --exclude-standard）

- `.workbuddy/memory/2026-08-04.md`
- `.workbuddy/memory/2026-08-05.md`
- `.workbuddy/memory/MEMORY.md`
- `DOCKER_DEPLOY_BLOCKER.md`
- `prisma/migrations/0001_init/migration.sql`
- `prisma/migrations/0002_add_inverter_phase_num/migration.sql`
- `prisma/migrations/0003_source_sync_audit/migration.sql`
- `prisma/migrations/migration_lock.toml`

## 4. Prisma migrations 状态

| 链路 | 目录 | 跟踪状态 |
|------|------|----------|
| 0001_init | prisma/migrations/0001_init | **未跟踪（untracked）** |
| 0002_add_inverter_phase_num | prisma/migrations/0002_add_inverter_phase_num | **未跟踪（untracked）** |
| 0003_source_sync_audit | prisma/migrations/0003_source_sync_audit | **未跟踪（untracked）** |
| 0004_preserve_source_record_identity | prisma/migrations/0004_... | 已跟踪 |
| 0005_align_device_latest_index | prisma/migrations/0005_... | 已跟踪 |

- `migration_lock.toml` 未跟踪。
- canonical 链推断为 `0001 → 0002 → 0003 → 0004 → 0005`（连续、无缺号）。
- 入口 `docker-entrypoint.sh` 执行 `prisma migrate deploy`，需要 **全部 5 个迁移文件在场**。
- **策略**：0001–0003 禁止删除/覆盖，将随本地部署提交纳入分支（见 Section 4/15）。

## 5. 当前容器与端口

`docker ps` 现状（与本任务无关，禁止停止）：

| 容器 | 镜像 / 状态 | 端口 |
|------|-------------|------|
| teslamate-home-docker-* (6 个) | teslamate 全家桶 | 4000(grafana 3000→3000) / 5432 / 1883 / 8080 |
| xianyu-auto-reply-fix | 4acc579011cb (healthy) | 5900 / 9000 |
| sansheng-demo | cft0808/sansheng-demo (healthy) | 7891 |

- **无 anti-reverse 容器在运行**。
- 主机 **3000 被 Grafana 占用** → 本任务绑定 **3102**（已在 compose 中处理）。
- 主机 **3102 当前空闲**。

## 6. 本轮明确不会修改的范围（冻结边界）

- 不修改 `daemon.json`（已确认 proxy 配置就绪，无需再改）
- 不修改 Docker Desktop 代理设置
- 不重启 Docker Desktop
- 不修改 Windows 系统代理
- 不硬编码 `host.docker.internal:7890` / `127.0.0.1:7890`
- 不在 `Dockerfile` 写入本机代理（现有构建期 ARG/ENV 待收口移除或参数化）
- 不停止与本项目无关的容器（teslamate / xianyu / sansheng 等）
- 不丢弃用户修改、不覆盖未跟踪 migration
- 不直接提交到 `main`，不推送、不合并
- 不执行 `docker compose down -v`（会删 Demo 数据卷）

## 7. 备份位置（仓库外）

```
C:/Users/Admin/.workbuddy/backups/anti_reverse_docker_demo_2026-08-05/
├── diff_binary.patch        (git diff --binary, 600 行)
├── untracked_list.txt       (未跟踪文件清单)
└── prisma_migrations/       (0001/0002/0003 + migration_lock.toml 副本)
```

备份已校验：**不含** `.env.local` / `.env.docker` / Mongo 密码 / SQLite / `node_modules`。

## 8. 候选本地修复（待 Section 3 逐项验证，不止凭文字结论）

1. `fleetListHref` 满足 `typedRoutes`（返回 `UrlObject`）
2. `@types/react-dom` 补依赖
3. 测试 fixture 补 `reportedAt`
4. `inverterGenerationLabel` 字段补齐
5. `eventType` 可选类型
6. 端口 3000 → 3102

## 9. 下一步

- Section 2：复验 docker 工具链与镜像缓存（网络 Gate）
- Section 3：`npm ci` / `prisma generate` / `typecheck` / `lint` / `test`
- Section 4：migration 链在仓库外空库 + 副本库复现 + 幂等
- Section 5/6：Dockerfile 收口 + 生产 compose 修复
- Section 7：独立 `docker-compose.demo.yml`
- Section 8–13：构建 / 启动 / 页面验证 / 持久化验证
- Section 15：文档 + 本地提交（分支，不推送）
