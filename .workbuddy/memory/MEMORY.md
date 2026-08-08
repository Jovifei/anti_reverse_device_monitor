# 项目长期记忆（anti_reverse_device_monitor_delivery_v1）

## 会话启动约定（重要）
- 每次会话开始，必须先读取 `PROJECT_HANDOVER_CURRENT_STATUS.md`（位于**仓库根目录**，不在 `docs/`）。
- 注意：该交接文档里写的 Branch 是 `codex/phase2-ui-acceptance`，与实际工作分支不一致；读取时以 `git branch --show-current` 为准，不要被文档里的分支名误导。
- `AGENTS.md` 要求先跑 `comet resume-probe . --stdin --json`；comet CLI 存在路径转译 bug（E:\c\Users 应为 C:\Users）可能损坏，尝试一次失败则跳过，不阻塞正常任务，在报告中注明即可。

## 项目核心约束（来自交接文档 + 用户红线）
- 设备白名单：`config/devices.json`（372 台生产注册表），是唯一来源；**禁止** IoT 自动覆盖。
- **禁止**修改 Mongo 配置 / 数据；**禁止** MQTT 控制 / OTA；**禁止**提交 `.env` / 真实设备数据。
- Docker Demo 部署目标：不连 Mongo、不启 sync worker，只验证 Next.js+SQLite+Docker 完整运行。
- 用户偏好：代码改动完成并本地提交后**直接 `git push`** 到功能分支，不建 PR、不用 gh CLI。

## 关键架构事实
- Next.js 15 App Router + Prisma 5.20 + SQLite（`force-dynamic`，构建期不查 Prisma）。
- `/devices` 列表页是 `config/devices.json` 硬白名单；`src/adapters/source-db/device-registry.ts` 支持 `DEVICES_REGISTRY_PATH` 覆盖（**必须相对路径**，路径不存在时静默回退到 `config/devices.example.json`）。
- 在线判定窗口 15 分钟（`OFFLINE_THRESHOLD_MINUTES=15`）；逆流判定 active_power_ct1/2/3 < 0。
- 页面链路不 import MongoDB 适配器；`SOURCE_DB_ENABLED=false` 即可不连 Mongo。
- Prisma 迁移链 0001_init → 0005_align_device_latest_index；`migrate deploy` 幂等（第二次为 no-op）；改动 `0001_init/migration.sql` 字节会触发 P3009。
