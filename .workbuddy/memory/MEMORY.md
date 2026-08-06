# 项目长期记忆 — 防逆流设备运行可视化系统

## 项目本质
- 只读观察系统（不下发 MQTT/OTA/配对/控制）
- 防逆流 CT 电表 + 最多 8 台微逆的可视化
- 技术栈：Next.js 15 + TypeScript + Prisma + SQLite（三期迁 PostgreSQL）

## 阶段状态（截至 2026-08-04）
- 阶段0 离线原型V4：✅ 已完成
- 一期 SQLite MVP：✅ 已完成（Excel导入、多SN查询、CT/微逆页面、ECharts、字典解码、软刷新、离线HTML导出、Docker Compose）
- 二期 Mongo 只读接入：🟡 PARTIAL（离线基础完成，真实联调阻塞）
- 三期 PostgreSQL 生产化：⏸️ 待执行

## 关键阻塞点
1. **Mongo 权限**：账号认证成功（SCRAM-SHA-1 + directConnection），但 `log` 库的 `find/listCollections/dbStats` 全部 error 13。真实日志在 `zeico_cloud.device_log_689adc659f04ec32f7642fbb`，需要 DBA 授权只读角色或提供 `MONGODB_COLLECTION`。
2. **字段映射**：工作状态缺 SIID、Inv5/6 缺前缀、发电量单位未确认、微逆 SN/版本/相位不在日志导出中。
3. **二期真实联调未执行**：真实属性同步、多设备验收、压力/延迟基线均未跑。

## 关键文档入口
- `00_START_HERE.md` — 项目入口
- `docs/01_PROJECT_OVERVIEW.md` — 业务目标 11 问
- `docs/05_CURRENT_STATUS_AND_DELIVERABLES.md` — 当前完成情况
- `docs/10-STUD-学习/01-STUD-技术路线总览.md` — 嵌入式视角技术知识库（44KB）
- `docs/CT_SIID_PIID_REPORTING.md` — SIID/PIID 字段映射真相表
- `docs/MONGODB_AUTH_DIAGNOSTIC_REPORT.md` — Mongo 鉴权诊断
- `docs/MONGODB_PERMISSION_MATRIX.md` — 权限矩阵
- `tasks/lessons.md` — 经验教训
- `tasks/todo.md` — 任务清单（含未完成项）

## 注意
- 项目内无 `.obsidian` 目录；"obsidian 知识库"实际指 `docs/10-STUD-学习/` 和 `docs/superpowers/` 这套学习/规格文档体系。
- 项目根有 `00_START_HERE.md`、`AGENTS.md`/`CLAUDE.md`/`GEMINI.md`（三份等价 AI 协作指令）。
- AGENTS.md 提示项目有 code-review-graph MCP，探索代码应优先用图工具。

## Docker 部署约定（2026-08-05 验证）
- **独立 Demo 部署**：`docker compose -p anti-reverse-demo -f docker-compose.demo.yml up -d`。SOURCE_DB_ENABLED=false、不读 .env.docker、独立 demo-data 卷、demo-seed 一次性 + app(healthcheck /api/live)。访问 http://127.0.0.1:3102/devices。
- **生产部署**：`docker compose up -d`（app）+ `--profile sync up -d`（同步 worker，需 Mongo 已授权）。端口默认 3102（主机 3000 被 Grafana 占用）。
- **致命坑**：容器内入口脚本 `scripts/docker-entrypoint.sh` 必须是 LF 换行。CRLF 会让 `set -eu\r` 在 Linux dash 中报 `Illegal option -` 致 app 无限重启。已加 `.gitattributes`(*.sh eol=lf) 锁定；若容器崩溃先查该文件换行。
- **禁止** `docker compose down -v`（会删数据卷）；迁移用 `prisma migrate deploy`（非 db push）；canonical 迁移链 0001-0005 现已全部纳入 git。
- **daemon 无出网时重建**：Docker Desktop 默认无外网出口，裸 `docker compose build` 会在 `apt-get update`/`npm ci` 直连挂死（无输出、长时间卡住）。Host 代理在 `127.0.0.1:7890` 且可从容器经 `host.docker.internal:7890` 连通。重建传 `--build-arg HTTP_PROXY/HTTPS_PROXY=http://host.docker.internal:7890 --build-arg NO_PROXY=localhost,127.0.0.1,.docker.internal`（Dockerfile 已预留 `ARG HTTP_PROXY`）。buildx 缓存（~16GB）在时亦可纯离线构建。
- 验证文档：`docs/DOCKER_DEMO_DEPLOYMENT_REPORT.md`、`docs/DOCKER_OPERATIONS.md`、`docs/DOCKER_PREDEPLOY_AUDIT.md`。
