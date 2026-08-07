# 本地与 Docker 操作手册

> 证据级别：本地启动 / 同步 / 软刷新策略 ✅ 已对照代码与联调；Docker Compose 打包 ✅ 仓库内已有，本机未装 Docker 故 ⚠️ 待环境验证。

## 1. 推荐日常启动（Windows）

一键脚本：`start-monitor.ps1`（仓库根目录）。

```mermaid
flowchart TB
  A[1. prisma migrate] --> B[2. devices:apply-map]
  B --> C[3. source:sync 追增量]
  C --> D[4. source:worker 新窗口]
  D --> E[5. open-monitor 起 Next 并开浏览器]
```

步骤说明：

| 步骤 | 动作 | 说明 |
|------|------|------|
| 1/5 | `scripts/ensure-db-migrations.mjs` | 应用本地 SQLite 迁移 |
| 2/5 | `npm run devices:apply-map` | `config/device-sn-map.xlsx` → `config/devices.json` |
| 3/5 | `npm run source:sync` | 按 checkpoint 从 Mongo 追到「现在」 |
| 4/5 | `npm run source:worker` | 后台增量（默认约 60s，看 `.env.local`） |
| 5/5 | `scripts/open-monitor.ps1` | 健康检查 `:3000`，不健康则杀旧 Next 再起 |

前置：

- 已有 `.env.local`（自 `.env.local.example` 复制并填 Mongo）
- 已有 `config/devices.json`（仓库已跟踪 12 台 SN↔device_id；也可由 `config/device-sn-map.xlsx` 经 `devices:apply-map` 刷新）
- 已安装 Node.js

浏览器入口：`http://localhost:3000/devices`

## 1.1 每日 0:00 自动同步 IoT 注册表（Windows 计划任务）

`start-monitor.ps1` 是一键启动器（含迁移 / SN 注册表 / source:sync / worker / Next），**不是**每日定时任务。
真正的「每日 0:00 刷新 `config/devices.json`（造梦者 ~372 台）」由专门的脚本承担：

- 入口：`sync-iot-daily.cmd` → `scripts/sync-iot-daily.ps1`
- 动作：仅跑 `npm run devices:sync-iot`，不启动 Web / Worker，适合无头定时任务
- 日志：`logs/sync-iot-daily-YYYY-MM-DD.log`（同一天追加，含 npm 输出）

用计划任务注册（每天 0:00，当前用户、无论是否登录都运行）：

```bash
schtasks /Create /TN "AntiReverse_IoT_DailySync" /TR "D:\work\anti_reverse_device_monitor\sync-iot-daily.cmd" /SC DAILY /ST 00:00 /RL HIGHEST
```

验证 / 手动跑一次：

```bash
powershell -File scripts/sync-iot-daily.ps1
# 或双击 sync-iot-daily.cmd
```

> 说明：docker 正式部署走 `POST /api/cron/sync-iot`（带 `CRON_SECRET`），不走这个 cmd。

## 2. 手动命令（等价拆分）

```bash
# 开发 Web
npm run dev

# 一次性增量同步（隔夜后可能很久）
npm run source:sync

# 常驻增量 Worker（勿与第二份 Worker 重复开）
npm run source:worker

# 单设备重同步（忽略共享 checkpoint）
npm run source:sync -- --device-id <mongo_device_id>
```

## 3. 隔夜 / 关机后再开为什么很慢？

`source:sync` 使用 **checkpoint 高水位 → 当前时刻** 窗口。电脑与 Worker 停了一夜后，窗口可达十余小时，Mongo 分页约每页 18s（代理链路），总时长十几分钟属正常。

白天 Worker 一直跑时，窗口只有一两分钟，通常 1～2 页就结束，所以会感觉「以前很快」。

建议：日常尽量保持 `source:worker` 窗口不关；追数未完成前不要依赖页面「实时最新」。

## 4. 页面转圈 / Next 假死

### 根因（已定位）

设备详情页一次 RSC 极重（历史 + 8 路微逆摘要 + 8 路 7 天曲线）。旧版 `LiveSourcePoller` 约每 45s **无条件** `router.refresh()`，并在 pending 超时后**再叠一次刷新**，会把 Next 打到 `CLOSE_WAIT` / 高 CPU / 全站超时。

### 当前策略（代码）

| 规则 | 位置 |
|------|------|
| 总览：指纹变化才 soft-refresh | `soft-refresh-policy.ts`、`LiveSourcePoller` |
| 详情/微逆：指纹变 →「有新数据」横幅并启动 5 分钟计时；满 5 分钟且无 pending 才自动整页刷 | 同上 + `DataStaleBanner` |
| KPI 带约 60s 拉 `/api/devices/[sn]/latest` 局部更新 | `device-live-kpis.tsx` |
| pending 时禁止再开第二次刷新；手动按钮与 Poller 共享 `refreshInFlight` | 同上 + `live-data-stale-context.tsx` |
| `lastHeavyFullRefreshMs≤0` 只横幅计时，不立刻整页刷（已单测） | `soft-refresh-policy.ts` |
| Prisma SQLite 补 `socket_timeout` + `connection_limit=1` | `src/lib/sqlite-url.ts`、`src/lib/prisma.ts` |
| open-monitor：端口在听但不健康则杀进程重启 | `scripts/open-monitor.ps1` |

新鲜度预期（非秒级）：Worker 默认约 10s 起一轮 → KPI 约 1～2 分钟跟上；曲线点「刷新数据」立刻，或最多约 5 分钟自动整页一次。

详情页要立刻更新曲线：点右上角 **「刷新数据」** 或横幅上的 **「刷新完整页面」**。

### 应急恢复

1. 结束占用 3000 的 `next` / `start-server` 进程  
2. `npm run dev` 或再跑 `start-monitor.ps1` 的第 5 步  
3. 硬刷新浏览器（勿死等旧标签）

### 卡死自动重启（watchdog）

常驻脚本：`scripts/next-watchdog.ps1`（`start-monitor.ps1` 结束时会自动开一个窗口；也可单独跑）。

| 项 | 行为 |
|----|------|
| 探测 | 每 30s `GET http://127.0.0.1:3000/api/live`，超时 8s |
| 判死 | 连续 2 次失败（端口在听但无响应）→ 杀 Next 并重启 |
| 未监听 | 自动 `npm run dev`（`NODE_OPTIONS=--max-old-space-size=4096`） |
| 冷却 | 两次重启间隔至少 90s，避免抖动 |

```bash
# 单独启动 watchdog（保持窗口开着）
npm run dev:watchdog
# 或
powershell -File scripts/next-watchdog.ps1
```

`open-monitor.ps1` 仍做**启动时一次**健康检查：端口在听但不健康则先杀再起。Watchdog 负责**运行中**持续监护。

## 5. 总览筛选能力（运维观察）

| 筛选 / 卡片 | 含义 |
|-------------|------|
| 正在逆流 | 在线 CT 当前三相功率为负 |
| 近7天长时逆流 | 近 7 天任一相逆流区间持续 **≥40 分钟** |
| 待处理离线 | CT 离线不足 7 天 |
| 存在离线微逆 | 已配对通道中有 offline（`online_state≠2`） |
| 在线 / 活跃 CT | 在线数 / 活跃总数 |

相关实现：`DeviceService.listDevices`、`src/domain/sustained-reverse-flow.ts`。

## 6. Docker 部署（正式）

⚠️ 需已安装 Docker Desktop / Compose。

```bash
copy .env.docker.example .env.docker
# 编辑 .env.docker：MONGODB_URI 等；SOURCE_DB_ENABLED=true
# 确认 config/devices.json（构建时打进镜像）

docker compose up --build -d
# 常驻同步 Worker（与 Web 共享 app-data 卷）
docker compose --profile sync up -d sync
```

说明：

- `app`：Next 生产服务，`ENTRYPOINT` 先 `prisma migrate deploy`
- `sync`：`npm run source:worker`
- 数据卷：`app-data` → `/app/data`
- 密钥只在 `.env.docker`，勿提交；镜像内不嵌密码

一次性同步（调试）：

```bash
docker compose --profile sync run --rm sync
# 或
docker compose exec app npm run source:sync
```

更多见 [MONGODB_READONLY_SOURCE.md](./MONGODB_READONLY_SOURCE.md)。

## 7. 验证命令

```bash
npm run typecheck
npm test
npm run build
npm run verify-data
```
