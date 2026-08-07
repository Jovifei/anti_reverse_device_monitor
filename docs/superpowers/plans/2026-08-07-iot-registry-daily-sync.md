---
change: iot-registry-daily-sync
design-doc: docs/superpowers/specs/2026-08-07-iot-registry-daily-sync-design.md
base-ref: 3f7224c9ac94437a8e3a7fe133dd16b9d75c512a
---

# IoT 注册表 + 7 日分类 + 每日 0:00 同步 — 实现 Plan

## 概述

按 OpenSpec tasks.md 7 个任务组实现。任务组 5（WorkBuddy automation）按用户决策**不实现**（deferred 到 docker 部署阶段）。最终 6 个任务组、约 21 个子任务。

测试驱动（`tdd_mode: tdd`）：每组先写失败单测，再实现，再绿。

---

## 任务组 1: 注册表数据层 — 7 日分类 view-model

### 文件
- `src/services/device-service.ts`（改）

### 步骤
1. **TDD red**: 在 `tests/unit/device-service-classify.test.ts` 写 6 个边界场景（mock 7 种状态），跑 `npx vitest run` 确认失败
2. **TDD green**: 在 `DeviceListResponse.items` 元素类型加 `classifyStatus: 'active' | 'stale-offline'`；在 `summary` 加 `staleOfflineCount: number`、`registryTotal: number`
3. 在 `listDevices()` 内部对每个 item 计算 `classifyStatus`：
   ```ts
   const now = Date.now()
   const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
   const hasRecentReport = item.lastReportedAt != null && now - new Date(item.lastReportedAt).getTime() <= SEVEN_DAYS_MS
   const iotOnline = item.online === true
   const classifyStatus = hasRecentReport || iotOnline ? 'active' : 'stale-offline'
   ```
4. 跑单测确认绿

### 验收点
- `npx vitest run tests/unit/device-service-classify.test.ts` 全绿
- `npx tsc --noEmit` 0 新增错误

### 风险
- 当前 `config/devices.json` 里 IoT 条目**没有** `lastReportedAt`（来自 IoT 平台），只有 Mongo join 后才可能有。`classifyStatus` 计算时机要在 Mongo join 之后。
- 边界 7 天包含（`≤`）——与 spec 一致。

---

## 任务组 2: 页面层 — 7 日以上离线 KPI 卡与筛选

### 文件
- `app/devices/page.tsx`（改）
- `app/globals.css`（改：新增 .stale-offline-row 与 .fleet-priority-card.stale-offline）

### 步骤
1. **TDD red**: 暂不写（页面是 server component，单测覆盖成本高；改为手动浏览器验证 + snapshot 测试）
2. 在 `FILTERS` 数组加 `{ value: 'stale-offline', label: '7 日以上离线' }`
3. 在 `fleet-priority-grid` 末尾加「7 日以上离线」KPI 卡（参考 online 卡的写法，链接到 `?status=stale-offline`）
4. 在 `fleet-status-tabs` 数组也加 `stale-offline` tab 入口
5. 在 `status === 'stale-offline'` 分支过滤 `items.filter(i => i.classifyStatus === 'stale-offline')`
6. 表格行 `className` 加 `device.classifyStatus === 'stale-offline' && 'stale-offline-row'`
7. CSS 新增：
   ```css
   .fleet-priority-card.stale-offline strong { color: #6b7a90; }
   .fleet-priority-card.stale-offline.is-active { border-color: #b0b8c4; box-shadow: 0 0 0 2px rgba(107, 122, 144, .15); }
   tr.stale-offline-row td, tr.stale-offline-row th { color: #8a93a3; background: #f8f9fb; }
   tr.stale-offline-row td .badge.offline { background: #e2e6ec; color: #6b7a90; }
   ```

### 验收点
- `npm run dev` 浏览器开 `/devices`：看到第 7 张 KPI 卡 = ~360
- 点击 KPI 卡：URL 变 `/devices?status=stale-offline`，表格列出 ~360 行
- 行用 `stale-offline-row` 灰底样式

### 风险
- 表格 12 → 372 行可能慢；不在本 change 处理（折叠功能 deferred）
- legacy 12 台与 372 台 IoT 是不同设备集，确保并集展示（merge 函数已处理）

---

## 任务组 3: Cron 路由层

### 文件
- `app/api/cron/sync-iot/route.ts`（新建）
- `package.json`（改：加 `cron:sync-iot` 脚本）

### 步骤
1. **TDD red**: 在 `tests/unit/cron-sync-iot-route.test.ts` 写 6 个场景（mock child_process.execFile + 各种环境变量），跑确认失败
2. 新建 `app/api/cron/sync-iot/route.ts`：
   - `export async function POST(req: Request)`：
     - 读 `process.env.CRON_SECRET`；缺失返 503 `{error: 'cron secret not configured'}`
     - 读 `req.headers.get('authorization')`；非 `Bearer ${secret}` 返 401 `{error: 'unauthorized'}`（用 `crypto.timingSafeEqual` 防时序攻击）
     - 用 `child_process.execFile` 跑 `node` 二进制（绝对路径：`./node_modules/.bin/tsx.cmd` 在 Windows / `./node_modules/.bin/tsx` 在 Linux），参数：`scripts/sync-iot-device-registry.ts`，cwd `process.cwd()`，env 透传 process.env，超时 120_000
     - 成功：返回 200 + 解析脚本最后 stdout 的 JSON
     - 失败：返回 500 + `error: stderr[0..500]`
   - `export async function GET()`：返 405 + `Allow: POST` 头
3. `package.json` 加：
   ```json
   "cron:sync-iot": "node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/sync-iot-device-registry.ts"
   ```
4. 跑单测确认绿

### 验收点
- 6 个单测全过
- 真实 `curl` 测试（dev 环境）：
  - `curl -X POST http://localhost:3000/api/cron/sync-iot` → 401
  - `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-iot` → 200
  - 缺 `CRON_SECRET` env → 503
  - `curl http://localhost:3000/api/cron/sync-iot` → 405

### 风险
- Windows 上 `node` 二进制可能不是直接 `node`，需用 `process.execPath`（即 next 进程自身的 node）
- `child_process.execFile` 与 `child_process.exec` 不同：不会触发 shell，避免 Windows cmd 转义问题

---

## 任务组 4: 配置与文档

### 文件
- `config/.env.local.example`（改）
- `config.txt`（改）
- `README.md`（改：加「定时同步」小节）

### 步骤
1. `.env.local.example` 末尾加：
   ```bash
   # /api/cron/sync-iot 鉴权密钥。生成：openssl rand -hex 32
   # 缺失时路由返 503。
   CRON_SECRET=
   ```
2. `config.txt` 同步追加（与 .env.local.example 保持一致）
3. README 末尾加「定时同步」小节：
   ```markdown
   ## 定时同步（docker 部署阶段启用）
   
   本仓库提供 `POST /api/cron/sync-iot` HTTP 端点，由 `CRON_SECRET` 鉴权。
   
   - 配置：在 `.env.local` 写入 `CRON_SECRET=$(openssl rand -hex 32)`（与 `DREAM_MAKER_IOT_TOKEN` 同位置，已被 .gitignore 忽略）
   - 手动触发：`curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-iot`
   - 调度方式：docker 部署时由外部 cron（Windows Task Scheduler / Linux crontab）调上面那个 URL，每日 0:00 触发
   - 鉴权失败：401；缺 CRON_SECRET：503；脚本失败：500（含 stderr 前 500 字符）
   ```

### 验收点
- README 渲染正常，「定时同步」小节可见
- 搜索 "CRON_SECRET" 在 .env.local.example 与 config.txt 都存在

### 风险
- README 写完不强制跑 build 验证（构建时不影响）

---

## 任务组 5: 调度层（DEFERRED — 不执行）

按用户决策，本 change **不创建** WorkBuddy automation。调度留到 docker 部署阶段，由 docker 编排决定（Task Scheduler / crontab / k8s CronJob 等）。

OpenSpec tasks.md 的 5.1/5.2/5.3 全部不执行；任务组 6 跳过；任务组 7 提交时也不带 automation 相关文件。

---

## 任务组 6: 测试与回归

### 文件
- 无新文件（单测已在任务组 1、3 写）

### 步骤
1. `npx tsc --noEmit` 0 新增错误（仓库 15 个预存错误忽略）
2. `npx eslint app/api/cron app/devices src/services tests/unit/device-service-classify.test.ts tests/unit/cron-sync-iot-route.test.ts` 0 告警
3. `npm run devices:sync-iot -- --dry-run` 与上一轮行为一致（preview 设备 ~372）
4. `npm run devices:sync-iot` 真实跑一次，验证 `config/devices.json` 仍 372 台
5. 启动 dev 服务，浏览器验证 KPI 卡与筛选
6. 真实 `curl` 调 cron 路由，验证 200/401/503

### 验收点
- 上面 6 项全过

### 风险
- 无

---

## 任务组 7: 提交与发布

### 步骤
1. 暂存：
   - `git add` 只加本 change 涉及文件
   - 严禁 add `.env.local` / `.workbuddy/` / `_tsc_*.txt` / `_vitest_out.txt` / `tsconfig.tsbuildinfo` / `node_modules/`
2. 提交：
   ```bash
   git commit -m "feat: 7 日上线/离线分类 + /api/cron/sync-iot 路由" -m "<详细描述>"
   ```
3. 推送：`git push origin main`
4. 记录：`.workbuddy/memory/2026-08-07.md` 追加本 change 完成日志

### 验收点
- commit 干净（仅相关文件）
- push 成功
- memory 落盘

---

## 实现顺序（依赖）

```
1. DeviceService classify  →  2. 页面 KPI 卡与筛选  →  6. 测试与回归  →  7. 提交与发布
                           ↘  
3. Cron 路由  →  4. 配置与文档
```

任务组 1、3 可并行（独立），但任务组 2 依赖 1，任务组 4 依赖 3，任务组 6 依赖全部，任务组 7 依赖 6。

---

## 不实现 / 已排除

- WorkBuddy automation 调度（任务组 5）
- 表格性能优化（折叠 / 虚拟滚动）
- 「最近离线」单独分类
- IoT 注册表的自动归档 / 通知
- 把 IoT 同步脚本重构为函数（保持 CLI 边界稳定）

---

## 完成标准

- [ ] 任务组 1-4 全部完成且单测绿
- [ ] 任务组 6 真实端到端验证全过
- [ ] 任务组 7 提交并 push 成功
- [ ] `comet guard build --apply` 全部 PASS
