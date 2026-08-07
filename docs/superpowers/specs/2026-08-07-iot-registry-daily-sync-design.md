---
comet_change: iot-registry-daily-sync
role: technical-design
canonical_spec: openspec
---

# IoT 注册表 + 7 日分类 + 每日 0:00 同步 — 技术设计

## 1. Context

`/devices` 页面当前由 `app/devices/page.tsx` 渲染，调用 `DeviceService.listDevices()` 拿数据。`DeviceService` 从 `config/devices.json` 读注册表（12 条 legacy GC2001000 SN），与 Mongo 监控库 join 后返回。Mongo 监控库只保留 7 天窗口，IoT 平台已同步的 372 台中 360 台没有近期数据，渲染时被过滤掉。

上一轮已交付：
- `npm run devices:sync-iot`：从造梦者 IoT 平台 `getDevices` 拉全 372 台，写入 `config/devices.json`（含 `device_id`/`sn`/`nickname`/`online`）
- `mergeIotListIntoRegistry`：IoT 不带 `label` 的人工 Excel 项保留，新设备按 `device_id` 匹配

本 change 要解决：让注册表 372 台在 `/devices` 全部可见、按 7 日数据新鲜度分类；并提供 `POST /api/cron/sync-iot` HTTP 端点（为 docker 部署时由外部 cron 调度预留）。本 change 不创建 WorkBuddy automation（按用户决策，调度留到 docker 部署阶段）。

## 2. Goals / Non-Goals

**Goals：**
- IoT 注册表（372 台）作为设备全集，`/devices` 全部呈现
- 7 日分类口径：「Mongo 监控有 `lastReportedAt` 且距今 ≤ 7 天」OR「IoT `online=true`」任一为真 → 视为近 7 日上线（active）；否则 7 日以上离线（stale-offline）
- /devices 页面新增「7 日以上离线」KPI 卡 + 筛选入口
- 提供 `POST /api/cron/sync-iot` HTTP 端点（Bearer `CRON_SECRET` 鉴权），为未来 docker 部署阶段外部 cron 调度预留
- README 补「定时同步」与 `CRON_SECRET` 配置
- 单元测试 + 真实 `npm run devices:sync-iot` 端到端验证

**Non-Goals：**
- 不创建 WorkBuddy automation（用户决策，留到 docker 部署阶段）
- 不改 IoT 同步脚本（`scripts/sync-iot-device-registry.ts` + `src/adapters/iot-api/*`）
- 不改 `apply-device-sn-map.ts`（Excel 人工补漏路径）
- 不动 Prisma schema（注册表仍 JSON）
- 不动 Mongo 监控库（只读）
- 不做「最近离线」（监控有 7 日内数据但当前不在线）单独分类——按用户决策只做 active / stale-offline 二分
- 不实现 IoT 注册表的自动归档/通知

## 3. 文件清单（按依赖顺序）

| 文件 | 动作 | 依赖 |
|------|------|------|
| `src/services/device-service.ts` | 改：新增 `classifyStatus` 字段（active / stale-offline）、`staleOfflineCount`、`registryTotal` 计数 | 无（独立） |
| `app/devices/page.tsx` | 改：新增 `stale-offline` 筛选值与「7 日以上离线」KPI 卡 | 1 |
| `app/globals.css` | 改：新增 `.stale-offline-row` 与 `.fleet-priority-card.stale-offline` 样式 | 2 |
| `app/api/cron/sync-iot/route.ts` | 新建：POST 路由 | 无（独立） |
| `package.json` | 改：加 `cron:sync-iot` 脚本 | 4 |
| `config/.env.local.example` | 改：加 `CRON_SECRET` 占位 | 4 |
| `config.txt` | 改：加 `CRON_SECRET` 占位 | 4 |
| `README.md` | 改：加「定时同步」与 CRON_SECRET 配置 | 4, 5, 6 |
| `tests/unit/device-service-classify.test.ts` | 新建：测试 7 日分类边界 | 1 |
| `tests/unit/cron-sync-iot-route.test.ts` | 新建：测试路由鉴权/CRON_SECRET 缺失/成功调用 | 4 |
| `openspec/changes/iot-registry-daily-sync/specs/iot-device-registry/spec.md` | 已创建（OpenSpec spec） | n/a |
| `openspec/changes/iot-registry-daily-sync/specs/iot-sync-schedule/spec.md` | 已创建（OpenSpec spec） | n/a |

## 4. 关键设计细节

### 4.1 `DeviceService` 7 日分类

**位置**：`src/services/device-service.ts`

**改动**：在 `DeviceListResponse.items` 元素类型上加 `classifyStatus: 'active' | 'stale-offline'`；在 `summary` 加 `staleOfflineCount: number`、`registryTotal: number`；在 `listDevices()` 内部对每个 item 计算 `classifyStatus`：

```ts
// 伪代码（实际写在 device-service 内部）
function classifyDevice(item: {
  isOnline: boolean
  lastReportedAt: Date | null
  online?: boolean
}): 'active' | 'stale-offline' {
  const now = Date.now()
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  const hasRecentReport =
    item.lastReportedAt && now - item.lastReportedAt.getTime() <= sevenDaysMs
  const iotOnline = item.online === true
  return hasRecentReport || iotOnline ? 'active' : 'stale-offline'
}
```

**边界**：若 `lastReportedAt` 距今正好 7 天，`≤ sevenDaysMs` 包含边界（与 OpenSpec spec 一致）。

**`registryTotal`**：取自注册表加载后的总条数，不受 join 影响；与 `result.items.length` 共同表达「全集 vs 活跃」。

**`staleOfflineCount`**：`items.filter(i => i.classifyStatus === 'stale-offline').length`。

### 4.2 `/devices` 页面「7 日以上离线」KPI 卡

**位置**：`app/devices/page.tsx`（在 `fleet-priority-grid` 末尾）

**结构**（参考已有 `online` 卡）：
```tsx
<Link
  href={fleetListHref('stale-offline', q)}
  className={`fleet-priority-card stale-offline ${result.summary.staleOfflineCount ? 'is-active' : ''} ${status === 'stale-offline' ? 'is-selected' : ''}`}
  aria-current={status === 'stale-offline' ? 'page' : undefined}
>
  <span>7 日以上离线</span>
  <strong>{result.summary.staleOfflineCount}</strong>
  <p>
    {result.summary.staleOfflineCount
      ? `${result.summary.staleOfflineCount} 台 IoT 设备 7 日以上无上报数据`
      : '没有 7 日以上离线的 IoT 设备'}
    {' '}· 点击筛选
  </p>
</Link>
```

**筛选 `stale-offline` 行为**：在 `FILTERS` 数组加 `{ value: 'stale-offline', label: '7 日以上离线' }`，并在 page 顶部 `status` 分支里把 `'stale-offline'` 翻译为 `items.filter(i => i.classifyStatus === 'stale-offline')`。

**`fleet-status-tabs` 行**：也加 `stale-offline` tab 入口（与 KPI 卡链接一致）。

**空态文案**：「没有 7 日以上离线的 IoT 设备」。

### 4.3 表格渲染变化

**当前**：表格展示所有匹配筛选的设备。

**变化**：
- 行 `className` 加 `device.classifyStatus === 'stale-offline' && 'stale-offline-row'`
- 现有列保持不变
- 「最后上报」单元格：若 `lastReportedAt` 缺失且 `classifyStatus === 'stale-offline'`，显示「—」+ title "无近期上报数据"

### 4.4 CSS

**位置**：`app/globals.css`（在 `fleet-priority-card.inv-fault` 附近追加）

```css
.fleet-priority-card.stale-offline { /* 灰色边框，呼应「7 日以上离线」语义 */ }
.fleet-priority-card.stale-offline strong { color: #6b7a90; }
.fleet-priority-card.stale-offline.is-active { border-color: #b0b8c4; box-shadow: 0 0 0 2px rgba(107, 122, 144, .15); }

tr.stale-offline-row td,
tr.stale-offline-row th { color: #8a93a3; background: #f8f9fb; }
tr.stale-offline-row td .badge.offline { background: #e2e6ec; color: #6b7a90; }
```

颜色取自既有 `panel-heading` / `readonly-badge` 同色系（`#6b7a90`），不引入新色。

### 4.5 Cron 路由

**位置**：`app/api/cron/sync-iot/route.ts`

**关键点**：
- `POST` handler：检查 `Authorization === 'Bearer ' + process.env.CRON_SECRET`（用 `crypto.timingSafeEqual` 防止时序攻击；缺失时直接 503）
- 用 `child_process.execFile` 跑 `node`（直接调 `tsx` 二进制，避免 npm 嵌套 shell 复杂度）
- 命令：`node ./node_modules/tsx/dist/cli.mjs scripts/sync-iot-device-registry.ts`
- 工作目录：项目根（process.cwd()）
- 环境：透传 `process.env`（含 `DREAM_MAKER_IOT_TOKEN`、`CRON_SECRET` 自身不需要传）
- 超时：120s
- 返回：解析脚本最后一行 JSON 报告（脚本总是输出 `{status,total,...}` 格式的 JSON）；失败时把 stderr 前 500 字符加入响应

**`GET` handler**：返 405 + `Allow: POST` 头。

**server 日志**：`console.log('iot sync:', JSON.stringify({status, total, added, updated, removed, durationMs}))`。

**安全**：
- `CRON_SECRET` 缺失时（开发环境）路由直接 503
- 比较用 `crypto.timingSafeEqual`，长度不同时直接 401
- 路由不解析 body（不需要）

**`package.json` 脚本**：
```json
"cron:sync-iot": "node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/sync-iot-device-registry.ts"
```

**为什么不直接 npm run**：
- `npm` 嵌套 exec shell 会出现 PATH 丢失、windows 下 cmd.exe 兼容问题
- 直接调 `node` + `tsx` 二进制更可控

### 4.6 配置

**`config/.env.local.example`** 追加：
```bash
# Cron 路由鉴权密钥（用于 /api/cron/sync-iot）。生成：openssl rand -hex 32
# 缺失时路由返 503。
CRON_SECRET=
```

**`config.txt`** 同步追加（与 .env.local.example 一致）。

**`README.md`** 补一节「定时同步」：
- 介绍 cron 路由（POST /api/cron/sync-iot，Bearer 鉴权）
- 介绍如何生成 `CRON_SECRET`（`openssl rand -hex 32`）
- 介绍如何用 `curl` 手动触发（`curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-iot`）
- 介绍 docker 部署时如何挂外部 cron（Task Scheduler / crontab）调这个 URL
- 明确说明本仓库未创建 WorkBuddy automation

## 5. 测试策略

### 5.1 单元测试

**`tests/unit/device-service-classify.test.ts`**（新建）：
- 边界 1：当前在线（`isOnline=true`, `lastReportedAt=now-1h`）→ active
- 边界 2：IoT 报告在线但监控缺失（`isOnline=false`, `lastReportedAt=null`, `online=true`）→ active
- 边界 3：监控有 7 日内数据但当前离线（`isOnline=false`, `lastReportedAt=now-3d`, `online=false`）→ active
- 边界 4：7 日前数据（`lastReportedAt=now-7d-1min`, `online=false`）→ stale-offline
- 边界 5：7 日边界（`lastReportedAt=now-7d`）→ active（包含边界）
- 边界 6：监控有数据但 `online=undefined`（IoT 旧条目）→ 用 `lastReportedAt` 判定
- `staleOfflineCount` 计数正确性

**`tests/unit/cron-sync-iot-route.test.ts`**（新建）：
- 缺 Authorization → 401
- 错误 Bearer → 401
- 缺 `CRON_SECRET` 环境变量 → 503
- 正确 Bearer + 脚本成功 → 200 + JSON 报告
- 正确 Bearer + 脚本失败 → 500 + stderr
- `GET` 请求 → 405
- 时序攻击：使用 `crypto.timingSafeEqual` 验证

### 5.2 真实端到端验证

- 跑 `npx tsc --noEmit`：0 新增错误（15 个预存错误忽略）
- 跑 `npx eslint <改动路径>`：0 告警
- 跑 `npm run devices:sync-iot -- --dry-run`：与上一轮行为一致
- 跑 `npm run devices:sync-iot`：写 372 台到 `config/devices.json`
- 跑 `npm run dev` 浏览器开 `/devices`：看到 7 日以上离线 KPI 卡 = 360
- 点击 KPI 卡：URL 变 `/devices?status=stale-offline`，表格展示 360 行
- `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-iot`：返 200 + JSON
- `curl` 不带 Bearer：返 401

## 6. Risks / Trade-offs（与 OpenSpec design.md 互补）

| Risk | Mitigation |
|------|-----------|
| 12 台 legacy GC2001000 SN 与 372 台 IoT SN 是不同设备集 | 合并展示（merge 函数已处理）；KPI 卡按全集 372 计算；两套 SN 都能在表格里看到 |
| 7 日分类首日 360 台新增到表格，页面渲染慢 | 现有表格本就 SSR，12→372 是 30× 增长；如慢再加折叠（不在本 change 范围） |
| `CRON_SECRET` 写在 .env.local 文件 | 与 `DREAM_MAKER_IOT_TOKEN` 同位置；`.gitignore` 已覆盖；真实值不会入库 |
| 路由 `execFile` 在 Windows 上的 PATH 问题 | 用绝对路径调 `tsx` 二进制；不通过 `npm` wrapper |
| IoT 平台 `online` 字段延迟 | OR 逻辑（监控 lastReportedAt 也算）—— 设备刚断电但 IoT 仍报 online，分类为 active（最坏只是 KPI 短暂虚高几分钟） |
| 路由未做并发保护（同一时刻被多次调用会并发跑脚本） | 现实场景：0:00 调度一次，无并发；如需要可后续加 mutex |

## 7. Migration / Rollback

**部署**（本地 + docker 都适用）：
1. 代码合入 → 跑 `npm install`（无新依赖）
2. 写 `.env.local` 的 `CRON_SECRET`（`openssl rand -hex 32`）
3. 启动 dev/prod 服务
4. 验证 cron 路由：`curl` 测试 200/401/503

**回滚**：
- 单 commit revert 代码 → KPI 卡与筛选消失，路由 404
- 路由单独移除：删除 `app/api/cron/sync-iot/route.ts`
- 注册表回滚：`git restore config/devices.json`

**外部 cron 接入**（docker 部署阶段，本 change 不做）：
- Linux crontab：`0 0 * * * curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-iot`
- Windows Task Scheduler：同上
- WorkBuddy automation：1 条 daily rrule，prompt = curl 命令

## 8. Open Questions（已确认）

| Question | Resolution |
|----------|-----------|
| 7 日分类口径 | Mongo `lastReportedAt` ≤ 7 天 **OR** IoT `online=true` → active；否则 stale-offline |
| 页面视图 | 新增「7 日以上离线」KPI 卡 + 筛选 |
| 调度方式 | Next.js cron 路由 + 留 docker 部署时挂外部 cron |
| automation 时区 | Asia/Shanghai（未来挂 cron 时按此时区） |
| CRON_SECRET 落点 | 根 `.env.local` |
| 「最近离线」分类 | 不要；只 active / stale-offline 二分 |
| 同步失败时是否阻塞 | 否；保留上次 `config/devices.json`，automation 日志留痕 |
