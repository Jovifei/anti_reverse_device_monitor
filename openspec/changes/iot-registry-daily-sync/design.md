## Context

`/devices` 页面当前由 `app/devices/page.tsx` 渲染，调用 `DeviceService.listDevices()` 拿数据。`DeviceService` 从 `config/devices.json` 读注册表（当前 12 条，legacy GC2001000 SN），与 Mongo 监控库 join 后返回。Mongo 监控库只保留 7 天窗口，372 台 IoT 设备中 360 台没有近期数据，渲染时被过滤掉。

上一轮已交付：
- `npm run devices:sync-iot`：从造梦者 IoT 平台 `getDevices` 拉全 372 台，写入 `config/devices.json`（含 `device_id`/`sn`/`nickname`/`online`）
- 合并逻辑（`mergeIotListIntoRegistry`）：IoT 不带 `label` 的人工 Excel 项保留，新设备按 `device_id` 匹配

本设计要解决：让注册表的 372 台都在 `/devices` 页面里出现，按 7 日数据新鲜度分类，并通过 HTTP 端点 + automation 完成每日 0:00 自动同步。

## Goals / Non-Goals

**Goals：**
- IoT 注册表作为设备全集，7 日以上离线的 360 台也在页面可见
- 7 日分类口径明确：「监控 DB lastReportedAt ≤ 7 天」OR「IoT online=true」任一为真即为上线
- /devices 页面新增「7 日以上离线」KPI 卡 + 筛选入口
- 提供 `POST /api/cron/sync-iot` HTTP 端点（Bearer 鉴权）
- WorkBuddy automation 每天 0:00 调用该端点
- README 补「定时同步」与 `CRON_SECRET` 配置

**Non-Goals：**
- 不改 `apply-device-sn-map.ts`（Excel 人工补漏路径保留）
- 不改 IoT 同步逻辑本身（只调脚本，不重写 `iot-client.ts`）
- 不改 Prisma schema（注册表仍用 JSON）
- 不动 Mongo 监控库（只读）
- 不实现「7 日以上离线设备的自动归档 / 通知」业务逻辑（spec 之外）

## Decisions

### Decision 1：分类口径在 DeviceService 层计算，不在 IoT 注册表
**Rationale**：IoT 注册表是 7 日全量快照的真相源；监控数据是 7 日窗口的「最近活动」叠加层。两层 join 后用 `isOnline`（DeviceService 已有，来自 Mongo 7 日窗口）+ IoT `online` 字段 OR 逻辑，落在 device-service 的 view-model 上；不修改 `config/devices.json` 的字段（保持 IoT 同步脚本的纯度）。

**Alternatives considered：**
- 把分类口径写进 IoT 同步脚本 → 拒：脚本应只负责同步设备，分类是消费方关注点
- 在 Mongo 侧加 7 日 rollup 物化视图 → 拒：超出本 change 范围，需要 DB 改动

### Decision 2：分类辅助字段 `classifyStatus` 在 DeviceService view-model 上
**Rationale**：现有 `DeviceListResponse.items` 已有 `isOnline` / `offlineAlert` 等展示字段；新增一个 `classifyStatus: 'active' | 'recent-offline' | 'stale-offline'`，前端只需读这一个字段决定渲染位置（KPI 卡 / 表格）。`recent-offline` 区分监控数据 7 日内但当前不在线的设备（之前混在「待处理离线」里，未来可扩展）。

**Alternatives considered：**
- 复用现有 `isOnline` 布尔 → 拒：无法区分「最近 7 天有过数据但当前离线」和「7 天以上无数据」
- 写 SQL/JOIN 视图 → 拒：服务层在 TS，不在 DB

### Decision 3：Cron 路由用 `child_process.execFile` 调 `npm run devices:sync-iot`
**Rationale**：脚本是上一轮已交付的 `scripts/sync-iot-device-registry.ts`，跑 tsx。直接 exec 它能复用所有现有逻辑（含 zod 校验、重试、merge、`--prune` 等）。不直接调 `iot-client.ts` 是因为脚本才是「单次同步」的边界，行为稳定。

**Alternatives considered：**
- 路由内部 `require('iot-client')` 直接调 → 拒：失去重试/CLI/diff 报告能力
- 把 `iot-client.ts` 抽成 `runSync({...})` 函数给路由直接调 → 拒：脚本已是稳定边界，重复抽象

### Decision 4：CRON_SECRET 进程级检查，缺则路由 503
**Rationale**：「缺失密钥时不接受请求」是显式失败模式，比「无密钥也接受」更安全。`automation_update` 创建 automation 时显式读 `CRON_SECRET` 并嵌入 prompt，避免密钥漂移到多个 automation。

**Alternatives considered：**
- 用 Next.js middleware 全局校验 → 拒：cron 是少数端点，不应污染全局 middleware
- 用共享 API key → 拒：Bearer JWT 已经是事实标准

### Decision 5：automation 用 RRULE `FREQ=DAILY;BYHOUR=0;BYMINUTE=0` 触发 prompt
**Rationale**：WorkBuddy automation 用 RFC 5545 RRULE，`FREQ=DAILY;BYHOUR=0;BYMINUTE=0` 北京时间 0:00（automation 服务时区需确认是 Asia/Shanghai）。automation 的 prompt 用 `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-iot` 调本地端点。

**Alternatives considered：**
- 进程内 setInterval → 拒：与 dev / build 模式不兼容，重启丢任务
- Windows Task Scheduler → 拒：与 WorkBuddy 生态不一致，迁移性差

### Decision 6：`config/devices.json` 仍是单一注册表文件
**Rationale**：上一轮已落地；本 change 只把它的内容作为 view-model 的输入，不引入新的存储层。

**Alternatives considered：**
- 拆 `config/devices-active.json` + `config/devices-archive.json` → 拒：复杂度高于收益，「7 日以上离线」是 view-model 分类，不需要物理归档

## Risks / Trade-offs

- **[Risk] IoT 平台 `online` 字段延迟**（设备刚断电 IoT 仍报 online 数分钟）→ **Mitigation**：分类用 OR 逻辑（监控 lastReportedAt 也算），最新活动优先
- **[Risk] automation 触发时服务未启动**（凌晨 0:00 服务在重启窗口）→ **Mitigation**：automation 失败重试 3 次（5/15/60 分钟），覆盖启动延迟
- **[Risk] 7 日分类首日 360 台新增到表格，页面渲染慢**→ **Mitigation**：表格本来就是 SSR + 客户端排序，12 → 372 是 30× 增长，先用 SSR 跑通；如慢可加 `display:none` 折叠（不在本 change 范围）
- **[Risk] 12 台 legacy GC2001000 SN 与 372 台 IoT SN 是不同设备集** → **Mitigation**：注册表并集展示（已有 merge 逻辑），KPI 卡按全集 372 计算
- **[Risk] `CRON_SECRET` 写在 automation prompt 里** → **Mitigation**：automation prompt 在 WorkBuddy 内部存储；不进 Git（.workbuddy/ 已被忽略）；如需更高安全，可后续迁移到环境变量

## Migration Plan

1. **代码层**：先在 `device-service.ts` 加 `classifyStatus`，改 `app/devices/page.tsx` 加 KPI 卡 + 筛选（dev 跑 `npm run dev` 验证）
2. **API 层**：加 `app/api/cron/sync-iot/route.ts`，本地用 `curl` 验证 200/401/503/500
3. **脚本层**：加 `package.json` 的 `cron:sync-iot` 包装脚本（`tsx scripts/sync-iot-device-registry.ts`，便于路由直接调）
4. **配置层**：写 `.env.local` 的 `CRON_SECRET`（不在 .env.local.example 写真实值），用 `openssl rand -hex 32` 生成
5. **调度层**：`automation_update --mode create` 创建 daily automation
6. **文档层**：README 加「定时同步」与 `CRON_SECRET` 配置
7. **回滚**：
   - 页面回滚：单 commit revert
   - automation 回滚：`automation_update --mode delete` 立即停调度
   - 注册表回滚：git restore `config/devices.json`（372 台那个版本）

## Open Questions

- **automation 时区**：WorkBuddy automation 是否用 Asia/Shanghai 还是 UTC？如 UTC 则 BYHOUR=0 = 北京时间 8:00，需要在 prompt 里注明并让用户确认
- **CRON_SECRET 落点**：放根 `.env.local`（与 `DREAM_MAKER_IOT_TOKEN` 同位置）还是 `config/.env.local`？建议根 `.env.local`，与现有约定一致
- **首日发布顺序**：先代码 → 再 automation？还是先 automation 测一遍再上代码？建议代码先行（automation 调 503 也不影响现有 UI）
- **「最近离线」（监控有数据但当前不在线）分类**：本 change 只做「近 7 日上线 / 7 日以上离线」二分；细分「recent-offline」留给后续
