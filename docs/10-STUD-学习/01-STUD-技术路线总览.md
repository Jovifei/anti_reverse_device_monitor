# 技术路线总览 — 防逆流设备运行可视化系统

> 本文写给复盘学习的工程师。以代码事实为据，解释系统「为什么这样设计」和「每一层怎么实现」，不做空泛概述。

## 1. 系统全景

### 1.1 技术栈

| 层 | 技术 | 版本 | 角色 |
|---|---|---|---|
| 运行时 | Node.js 22 | LTS | 单体服务 + 同步 Worker |
| Web 框架 | Next.js 15 App Router | 15.1 | RSC 为主、少量 Client Component |
| 语言 | TypeScript | 5.6 | 全栈 |
| ORM | Prisma | 5.20 | SQLite 数据访问 |
| 数据库 | SQLite | — | 单文件、零运维 |
| 图表 | Apache ECharts | 6.1 | 服务端不降采样，客户端全量渲染 |
| 验证 | Zod | 3.24 | 运行时 Schema 校验 |
| 电子表格 | xlsx | 0.18 | Excel 导入/导出 |
| 源数据库 | MongoDB | 7.5 | 只读拉取公司设备日志 |
| 测试 | Vitest + Playwright | 4.1 / 1.61 | 单元 + 集成 + E2E |
| 容器 | Docker Compose | — | Web + Sync 双服务 |

### 1.2 为什么先 SQLite 再 PostgreSQL

SQLite 适合当前阶段：快速开发、单机原型、Excel 数据导入、少量内部用户。迁移 PostgreSQL 的触发条件是：多人并发、数百/数千设备、持续同步写入、多实例部署、稳定告警。Prisma 抽象了数据库差异，迁移只需改 `datasource` 配置。

### 1.3 渲染架构

```mermaid
flowchart TB
    subgraph Browser["浏览器"]
        POLLER[LiveSourcePoller\n45s 间隔 · 30s 冷却]
        RSC[React Server Components\n服务端渲染]
        CC[Client Components\n6 个 'use client']
    end

    subgraph Next["Next.js 15 App Router"]
        PAGES[页面 RSC]
        API[Route Handlers\n12 个 REST 端点]
        DS[DeviceService\n组合+编排]
        TS[TelemetryService\n纯时序分析]
    end

    subgraph Data["数据层"]
        DR[DeviceRepository]
        TR[TelemetryRepository]
        PRISMA[Prisma Client]
        SQLITE[(SQLite)]
    end

    subgraph Sync["同步 Worker（独立进程）"]
        SYNC[SourceSyncService]
        MONGO[MongoLogSourceAdapter]
        SRC_MONGO[(公司 MongoDB\n只读)]
    end

    POLLER -->|POST /api/live| API
    API -->|revalidatePath| PAGES
    PAGES --> DS --> TS --> DR --> TR --> PRISMA --> SQLITE
    MONGO -->|find · 只读| SRC_MONGO
    SYNC --> TR --> PRISMA --> SQLITE
```

**关键设计决策：**

- **100% 服务端数据获取**：没有任何页面或组件从客户端发起数据请求。所有数据通过 `DeviceService` 在 async RSC 中直接调用，React Server Components 渲染后发送 HTML 到浏览器。
- **只有 6 个 Client Component**：`LiveSourcePoller`（定时刷新）、`SoftRefreshButton`（手动刷新按钮）、`TelemetryChart`（ECharts DOM 实例）、`MetricHistoryDialog`（弹窗 Portal）、`DeviceSnSwitcher`（下拉切换）、`DeviceSnSearch`（输入框搜索）。
- **刷新是软刷新，不是整页重载**：`POST /api/live` → `revalidatePath('/devices')` → `router.refresh()`，只重新获取 RSC 载荷，不触发浏览器导航。
- **同步 Worker 是独立 OS 进程**：`npm run source:worker` 启动一个独立的 Node.js 进程（4GB 堆），通过 SQLite 文件与 Web 进程通信。Web 进程不主动拉取数据，只被动读取 SQLite。

### 1.4 实际刷新频率（不是 10 秒）

当前代码的实际刷新参数：

| 参数 | 值 | 说明 |
|---|---|---|
| 轮询间隔 | 45 秒 | `src/components/live-source-poller.tsx:7` |
| 冷却时间 | 30 秒 | 上次刷新结束后至少等 30 秒 |
| API 超时 | 4 秒 | `POST /api/live` 超时后放弃 |
| 跳过条件 | 页面隐藏 / 正在刷新中 | `document.hidden` / `isPendingRef` |

**为什么不是 10 秒？** 设备详情页的 RSC 一次渲染会发起约 25 个并发服务调用（9 个顶层 `Promise.all`，其中 2 个内部各展开 8 个微逆查询）。45 秒是经过权衡后设置的保守值（commit `3ecbd88`：_"enhance source worker and UI responsiveness"_）。

---

## 2. 数据模型

### 2.1 核心表关系

```mermaid
flowchart TB
    DEVICE[Device · CT 网关] -->|1:N| BINDING[InverterBinding · 微逆通道]
    DEVICE -->|1:N| TELEMETRY[Telemetry · 遥测时序]
    DEVICE -->|1:1| LATEST[DeviceLatest · 当前值快照]
    BINDING -->|1:N| TELEMETRY
    BINDING -->|1:N| LATEST
    DEVICE -->|1:N| EVENT[DeviceEvent · 状态事件]
    DEVICE -->|1:N| ALERT[ReverseFlowAlert · 逆流告警]
    BINDING -->|1:N| FAULT[FaultEvent · 故障事件]
```

### 2.2 各表职责

| 表 | 唯一约束 | 读路径角色 | 写路径 |
|---|---|---|---|
| `Device` | `deviceSn UNIQUE` | 设备列表、详情页的身份和元数据。`platformOnline` + `lastReportedAt` 是仅有的两个在线判断字段。 | `upsertDevice` |
| `InverterBinding` | `(deviceId, inverterIndex) UNIQUE` + `(deviceId, inverterSn) UNIQUE` | 1~8 通道绑定关系。`paired` 字段控制是否参与统计。 | `findOrCreateInverterBinding` |
| `Telemetry` | `sourceRecordId UNIQUE` | 所有历史/图表/连通性/故障时间线读取都扫描此表。 | `upsertBatch`（插入或拒绝，不更新） |
| `DeviceLatest` | `(deviceId, inverterId, metricKey) UNIQUE` | 所有 KPI 卡片和仪表盘读取都命中此表，不走 `Telemetry`。 | 每次 `upsertBatch` 同一事务内从 `Telemetry` 最新行重新计算 |
| `DeviceEvent` | — | **未在读写路径中使用**。只被 `cleanup-retention.ts` 清理。 | 未写入 |
| `FaultEvent` | — | **未在读写路径中使用**。故障历史由 `Telemetry` 实时计算。 | 只被清理脚本和测试触碰 |
| `ReverseFlowAlert` | — | **未在读写路径中使用**。逆流告警由 `Telemetry` 实时计算。 | 只被 `seed-demo.ts` 和清理脚本写入 |
| `ImportBatch` | — | Excel 导入记录。 | Excel 导入路径写入 |
| `SyncCheckpoint` | `sourceName UNIQUE` | Mongo 同步游标。 | `SourceSyncService.sync` 每轮更新 |
| `SyncBatch` | — | 同步审计。 | 同步完成时写入 |
| `SyncError` | — | 同步失败记录。 | 冲突/失败时写入 |

### 2.3 最新值与历史数据分离

这是一个关键设计原则：

- **`DeviceLatest`** 是 `(deviceId, inverterId, metricKey)` 粒度的当前值物化视图。每次写入 `Telemetry` 时，在同一事务中重新查询 `findFirst ORDER BY reportedAt DESC, sourceRecordId DESC` 并更新 `DeviceLatest`。读取当前值走 `DeviceLatest`，不扫 `Telemetry`。
- **`Telemetry`** 是追加式时序表，只用于历史窗口查询（图表、连通性、故障时间线）。
- 这保证了设备总览页面的加载速度不受原始数据量影响。

### 2.4 MetricDefinition 表 — 未使用

`MetricDefinition` 表在 Prisma Schema 中定义了，但实际运行时字典是从 `config/metric_dictionary.example.json` 加载的（`src/domain/dictionaries.ts:34`）。代码中没有任何 `prisma.metricDefinition` 调用。该表是死表。

---

## 3. 领域逻辑

### 3.1 在线/离线判定

**平台级在线（CT 设备）：**

| 条件 | 判定 |
|---|---|
| `platformOnline === true` 且 `lastReportedAt >= now - 15分钟` | 在线 |
| `platformOnline === true` 但 `lastReportedAt < now - 15分钟` | 离线 |
| `platformOnline === false` 或 `lastReportedAt === null` | 离线 |

关键常量：`OFFLINE_THRESHOLD_MINUTES = 15`。`platformOnline` 只在写入新数据时设置为 `true`，从不设回 `false`。离线是推断出来的，不是标记出来的。

**7 天平台连通性窗口：**

这是 `telemetry-service.ts` 的 `getPlatformConnectivity` 方法实现的窗口分析。算法：

1. 加载窗口内所有遥测数据 + 窗口前最新一条基线
2. 将所有 `reportedAt` 去重排序（任何指标都算心跳，不区分 `metricKey`）
3. 扫描相邻时间戳：间隙 > 15 分钟 → 离线窗口 `[前一个时间 + 15分钟, 后一个时间]`
4. 窗口尾部：如果最后一个数据点到窗口结束 > 15 分钟 → 尾部离线窗口
5. 每个离线窗口的持续时间 = 实际间隙 − 15 分钟（15 分钟宽限期被扣除）

**微逆在线状态（两阶段）：**

| 阶段 | 方法 | 逻辑 |
|---|---|---|
| 优先 | `summarizeInverterOnlineStates` | `online_state` 指标值 `=== 2` 为在线 |
| 回退 | `getInverterHeartbeatConnectivity` | 无 `online_state` 时，用 15 分钟间隙模型 |

`online_state` 枚举：`2 → 在线`，`1 → 离线`，`0 → 未配对`（来自 `config/status_dictionary.json`）。

### 3.2 反向送电（逆流）检测

**阈值：严格 `< 0` 瓦特。** 没有迟滞、没有最小值门槛、没有最小样本数。`-0.01W` 也触发。

三相对应关系（三个地方重复定义）：

| 相 | 指标别名 |
|---|---|
| A | `active_power_ct1`, `ct.active_power.phase_a` |
| B | `active_power_ct2`, `ct.active_power.phase_b` |
| C | `active_power_ct3`, `ct.active_power.phase_c` |

**区间提取算法（`device-service.ts` 第 449-481 行）：**

1. 按相分别处理窗口内的遥测数据
2. 按 `reportedAt` 升序排列
3. 状态机：第一个负值 → 打开区间（`startedAt` = 该样本时间）；后续负值 → 更新 `minimumPower` 和 `sampleCount`；第一次非负值 → 关闭区间（`endedAt` = 关闭样本时间）
4. 窗口结束时仍为负值 → `endedAt: null`
5. 区间按时间降序排列（最新在前）

**严重性：只有一级。** `severity: 'critical'` 硬编码。没有告警级别区分。

**设备列表四态判定：**

| `isOnline` | 有负相 | `reverseState` |
|---|---|---|
| `true` | ≥1 | `active`（逆流中） |
| `true` | 0 | `normal` |
| `false` | ≥1 | `unknown-last-seen-reverse` |
| `false` | 0 | `unknown` |

设备列表的排序优先级：`active → offlineAlert → online → stale`，同优先级按 SN 排序。

### 3.3 故障位掩码解码

**字典：** `config/fault_dictionary.json`，`type: "uint32_bitmask"`，`bits` 映射 `"0".."31"` → 中文故障名称（bits 28-31 是保留位）。

**解码算法（`src/domain/faults.ts`）：**

```typescript
// 遍历 0-31 位，用无符号右移
for (let bit = 0; bit < 32; bit++) {
  if ((mask >>> bit) % 2 === 1) {
    faults.push({ bit, name: dictionary[bit] ?? `Fault bit ${bit}` })
  }
}
```

**显示规则：**
- `null`/`undefined`/非数值 → `null`（无遥测数据，不显示）
- `0` → `['当前无故障']`（明确的无故障状态）
- 非零 → 故障名称列表（按 bit 升序，不是按输入顺序）

**故障变化时间线（`telemetry-service.ts` 第 558-649 行）：**

1. 加载窗口内 `metricKey` 包含 `fault_param` 的遥测数据
2. 比较相邻样本的掩码差异
3. 分类：`appeared`（只新增位）、`recovered`（只移除位）、`changed`（两者都有）
4. 相同掩码跳过；窗口第一个样本如果掩码为 0 且无基线则跳过（干净启动不算事件）

### 3.4 在线微逆计数

**设备列表统计（`device-service.ts` 第 164-170 行）：**

- `pairedInverters = bindings.filter(b => b.paired)` — 只统计已配对通道
- `onlineInverterCount = pairedInverters.filter(b => b.latestRows.some(row => numericValue(row) === 2))` — 其中 `latestRows` 已被仓库层预过滤为 `metricKey: 'online_state'`，所以 `=== 2` 是安全的
- 显示规则：`onlineInverterCount / pairedInverterCount`

**显示标准化（`src/domain/online-inverter-count.ts`）：**

| 规则 | 含义 |
|---|---|
| `online = max(0, online)` | 负值截断为 0 |
| `total = max(online, total)` | total 至少等于 online |
| `offline = total - online` | 离线数 = 总数 − 在线数 |
| `allOnline = total > 0 && online >= total` | 0/0 不算 allOnline |
| 在线数：`allOnline` 或 `online > 0` 时绿色，否则红色 |
| 总数：`allOnline` 时绿色，否则红色 |

### 3.5 北京日出日落

`src/domain/beijing-sun.ts` — NOAA/Almanac 近似日出方程，计算北京（39.9042°N, 116.4074°E, UTC+8, 无夏令时）的日出日落时间。

**为什么需要这个？** PV 发电在夜间物理上为 0。夜间 0W 是正常的，白天 0W 才是故障。ECharts 图表的昼夜背景带让运维人员一眼就能区分。

**算法概要：**
1. 儒略日近似公式计算年积日
2. 太阳平均近点角 → 真黄经 → 赤经 → 赤纬
3. 天顶距 90.833°（含大气折射和太阳圆面半径）
4. 计算本地时角 → 平均时间 → 世界时 → 北京时间（UTC+8）
5. 返回 UTC 纪元毫秒

**图表应用：** 从可见范围前一天到后一天，逐日生成夜带 `[上一日落, 日出]` 和昼带 `[日出, 日落]`，裁剪到可见范围。日出/日落标记线仅当 `days ≤ 1` 时显示标签。

---

## 4. 数据摄入管道

### 4.1 两条独立管线

| 管线 | 接口 | 来源 | 模式 |
|---|---|---|---|
| MongoDB | `SourceTelemetryAdapter` | 公司 MongoDB 只读 | 游标增量同步，分页拉取 |
| Excel | `SourceAdapter → read()` | Excel 文件 | 一次性全量导入 |

两条管线都收敛于 `TelemetryRepository.upsertBatch`。

### 4.2 MongoDB 同步流程

```
MongoLogSourceAdapter.fetchTelemetry()
├── loadDeviceRegistry()          → 设备注册表（SN ↔ device_id）
├── loadMongoFieldMapping()      → 字段映射配置
├── shardTimeRange(6h)            → 时间窗口分片
├── allocateSyncPageBudgets()     → 按设备分配页面预算
├── 对每个设备 × 每个分片：
│   ├── collection.find()         → Mongo 查询（只读）
│   ├── expandDeviceLogDocument() → 展开 data.{siid}_{piid}
│   ├── expandIotEventLogDocument() → 展开 IoT 事件日志
│   └── composeDeviceLogDrivenPage() → 合成页面
└── 返回最新记录集合
```

**同步服务（`source-sync-service.ts`）：**
1. 读取 `SyncCheckpoint`（上次同步的游标）
2. 计算窗口 `[from, to]`（有游标从游标开始，无游标回溯 7 天）
3. 循环分页：`adapter.fetchTelemetry({cursor, from, to, limit})`
4. 每页逐行校验 → 去重 → 写入 `upsertBatch`
5. 更新 `SyncCheckpoint` 和 `SyncBatch`

**同步 Worker 循环：**
- 间隔：`SOURCE_SYNC_INTERVAL_SECONDS`（默认 10 秒）
- 串行执行，不重叠（`await` 后才开始下一轮）
- 每次循环新建 `MongoLogSourceAdapter` 并在 `finally` 中关闭
- SQLite 繁忙时最多重试 3 次，退避 `[250, 500, 1000] ms`
- 错误不会导致 Worker 退出

### 4.3 原始 Mongo 文档展开

**`expand-device-log.ts`：** 一个 Mongo 文档 → N 个遥测记录

1. 解析 `data` 对象中的每个 key（格式 `{siid}_{piid}`）
2. 对每个 key 调用 `resolveField`：
   - 优先：显式映射（`mongo-field-mapping`）
   - 其次：逆变器自动映射（SIID 4-11 → 逆变器索引 1-8, PIID 查表）
   - 否则：丢弃该字段
3. 生成 `sourceRecordId = "{mongo _id}:{siid}_{piid}"`

**`expand-iot-event-log.ts`：** 一个 IoT 事件文档 → 0 或 1 个遥测记录

1. 检查 `eventType` 为空或 `'DATA'`
2. 解析 `en` 字段中的 `P_{siid}_{piid}`
3. 目前只映射 `P_0_0 → wifi_signal_strength`（WiFi RSSI）
4. 生成 `sourceRecordId = "iot-event:{mongo _id}:{en}"`

### 4.4 时间分片策略

`time-shards.ts` 将时间窗口按 6 小时切分，从最新开始向后遍历。每个分片独立查询，一旦当前页面填满就停止——这样 7 天回溯时不会查询很久以前的数据。

### 4.5 幂等性保证

**三层去重：**

| 层 | 机制 | 位置 |
|---|---|---|
| 页内去重 | `Set<sourceRecordId>` | `source-sync-service.ts:129` |
| 写入前检查 | `findUnique({sourceRecordId})` | `telemetry-repository.ts:118` |
| 竞争捕获 | `P2002` 错误重试 | `telemetry-repository.ts:129-134` |

**`upsertBatch` 语义：** 虽然名字叫 upsert，但实际是 **insert-if-absent**（插入或拒绝）。如果已存在相同 `sourceRecordId` 的记录：
- 字段值完全相同 → 计为重复，跳过
- 字段值不同 → 计为冲突，保留现有值，记录为 `SyncError`

**派生状态幂等性：** `DeviceLatest` 在每次写入后从 `Telemetry` 表重新查询最新值，因此回填旧数据不会倒退当前状态。`Device.lastReportedAt` 和 `platformOnline` 只向前推进（`if (!device.lastReportedAt || row.reportedAt > device.lastReportedAt)`）。

### 4.6 安全措施

**只读执行：** MongoDB 适配器只使用 `find`、`distinct`、`ping`，不创建索引、不写入、不修改。代码注释明确标注 `// Read-only find; never insert/update/delete/createIndex.`。

**凭据保护：** 所有 MongoDB 凭据仅存在于 `.env.local`（不提交仓库）。`security.ts` 的红化函数只覆盖 postgres 连接字符串（`postgres://user:pass@host`）。MongoDB URI 中的密码如果以查询参数形式出现，会被 `password=`/`token=`/`secret=` 正则匹配红化。

**device_id 脱敏：** Mongo 的 `device_id` 仅在服务端注册表和同步中使用，不出现在页面文案或搜索框。未知 SN 的设备显示为 `unknown-{前8位}` 占位符，不暴露原始 `device_id`。

---

## 5. Web UI 层

### 5.1 页面结构

```
/ → redirect → /devices
/devices                         设备总览（列表 + 筛选 + 统计卡片）
/devices/[sn]                    CT 设备详情（面板 + 图表 + 微逆网格）
/devices/[sn]/inverters/[index]  微逆详情（发电 + 图表 + 故障历史）
```

### 5.2 设备总览页

- 4 个筛选标签：全部 / 在线 / 离线 / 逆流
- 3 个优先级卡片：正在逆流 / 待处理离线 / 在线-活跃
- 11 列表格：SN、型号、在线状态、离线时长、逆流状态、三相反送、微逆在线数、Sub1G、WiFi、最后上报、操作
- 客户端排序：`active reverse → offlineAlert → online → stale`，同优先级按 SN 排序
- 服务端只做全量查询，筛选和排序在内存中完成

### 5.3 CT 设备详情页

**一次渲染约 25 个服务调用：**

```
Promise.all([
  getDeviceSummary,        // 设备元数据
  getDeviceHealth,         // 平台 + 微逆在线状态
  getTelemetryLatest,      // 最新遥测
  getDeviceChartData,      // CT 图表数据
  getReverseFlowAlarms,    // 逆流告警
  getDeviceDataSourceLabel,// 数据源
  getDeviceHistory,        // 7 天连通性
  getRawExcelPath,         // 原始 Excel 路径
  Promise.all(Array(8) → getInverterSummary),   // 8 个微逆摘要
  Promise.all(Array(8) → getInverterChartData), // 8 个微逆图表
])
```

**页面布局：**
- 运行与策略 FactStrip（Sub1G 版本、工作模式、功率限制等）
- 版本与通信 FactStrip（固件/硬件版本、MAC、WiFi）
- 6 个 MetricCard（负载功率、电网功率、微逆发电、今日/累计发电量）
- 防逆流三相安全面板（A/B/C 相反送状态 + 告警记录）
- 功率总览 TelemetryChart（H=510px，默认显示 load/grid/generation）
- 电网电压与频率 TelemetryChart（H=360px）
- 1~8 微逆卡片网格（固定 8 个位置，缺失的显示 `—`）
- 上线/下线/持续离线 DatedRecordScroll

### 5.4 图表实现

**`telemetry-chart.tsx`（458 行）：**

**不降采样：** `sampling: undefined` 显式设置。所有原始样本点都绘制在图表上。降采样只在时间窗口层面（1/3/7 天选择器）和缩放层面进行。

**时间窗口：** 窗口终点锚定到数据的最新 `reportedAt`，而不是 `Date.now()`。这样离线设备的图表仍显示最后 7 天数据，而不是空白尾部。

**相位配色：**

| 系列 | 颜色 | 说明 |
|---|---|---|
| load | `#1463d9` | 负载 |
| grid | `#0d9488` | 电网 |
| generation | `#ea580c` | 微逆发电 |
| ct-a/b/c | `#A67C00/#168449/#1463d9` | CT 三相 |
| inv-a/b/c | `#65a30d/#7c3aed/#4f46e5` | 逆变三相 |
| voltage/frequency | `#2563eb/#9333ea` | 电网质量 |

**设计不变量：** 红色 `#c92828` 只用于渲染负功率证据，不作为正常系列标识色。`chartSeriesDisplayColor` 函数会将 7 种遗留告警红色重写为 `#2563eb`。

**负功率渲染：** 每个系列被拆分为 3 个 ECharts 层级：
1. 主线（负值显示为 `null`）
2. 红色覆盖线（只有负值段）
3. 红色散点层（`symbolSize: 8`，白色边框，`z: 4`）

**间隙处理：** 相邻样本超过 2 小时 → 插入 `null` 点，配合 `connectNulls: false` 避免在离线期间画虚假对角线。

**昼夜背景：** 北京日出日落（`beijing-sun.ts`）生成 `markArea`，白天 `rgba(255,236,179,0.38)`，夜间 `rgba(148,163,184,0.32)`。

**Tooltip：** 已提取到 `telemetry-chart-tooltip.ts`（54 行），修复了一个关键 bug：_从不回退到 `Date.now()`_——之前空日/夜系列被误当作 `list[0]`，`Number([])` 变成 `NaN`，导致鼠标悬停在历史数据点时显示"今天"。

### 5.5 弹窗（Metric History Dialog）

- 使用 `createPortal` 渲染到 `document.body`
- SSR 安全：`mounted` 标志 gating
- 锁定 `body.overflow`，添加 `metric-dialog-open` 类
- Escape 关闭
- 内嵌一个 `TelemetryChart`（H=440px）

---

## 6. 离线 HTML 导出

### 6.1 架构

```
源数据（SQLite / Demo / Excel）
  → DeviceService 查询
  → buildDeviceViewModel / buildOverviewViewModel / buildInverterViewModel
  → renderOfflineHtmlDocument
  → 自包含 HTML 文件
```

### 6.2 自包含设计

每个离线 HTML 文件包含：

```html
<style>...</style>                         <!-- 手写 CSS（与 globals.css 独立） -->
<script>window.__OFFLINE_VM__ = {...}</script>  <!-- 序列化的视图模型 -->
<script>/* echarts.min.js */</script>           <!-- 内联或外链 ECharts -->
<script>/* client-runtime.ts IIFE */</script>   <!-- 客户端运行时 -->
```

### 6.3 客户端运行时（`client-runtime.ts`，506 行）

**零网络请求。** 一个纯 ES5 的 IIFE 脚本，是 `telemetry-chart.tsx` + `beijing-sun.ts` 的手工移植：

- 读取 `window.__OFFLINE_VM__` 获取视图模型
- 对每个 `[data-chart-panel]` 元素初始化 ECharts 实例
- 生成系列切换复选框和天数选择器
- 实现完整的 tooltip、昼夜背景、负功率红色层
- 支持 `[data-open-series]` 属性打开弹窗图表

### 6.4 视图模型嵌入（`embedded-view-model.ts`）

HTML 文件中的 `window.__OFFLINE_VM__` 是序列化的视图模型。这使得离线 HTML 文件**自描述且可回环**——可以从 HTML 中提取视图模型，重新渲染页面，而不需要原始数据源。

`scripts/refresh-offline-html-snapshots.ts` 利用这一点：读取现有 HTML 文件中的视图模型，用更新的代码重新渲染，覆盖原文件。

### 6.5 导出模式

| 模式 | 标志 | 输出 | ECharts |
|---|---|---|---|
| 单文件 | `--single-file` | `device-{SN}.html` | 内联（~1MB） |
| 打包 | `--bundle` | `bundle/` 目录 + ZIP | 外链共享 |
| Demo | `--demo` | 默认同时生成单文件和打包 | 自动种子数据 |

### 6.6 视觉一致性

**CSS 是独立维护的：** `src/export/offline/styles.ts` 和 `app/globals.css` 是两套独立的 CSS 文件（无共享、无构建关联）。它们共享 `:root` 自定义属性名称（`--ink`, `--blue`, `--red-wash` 等），但手动复制。

**图表运行时是手工移植的：** `client-runtime.ts` 是 `telemetry-chart.tsx` 的手工重新实现。这意味着对 Live 图表的修改需要同步移植到离线运行时。

**共享的领域逻辑：** `chartSeriesDisplayColor`、`formatOnlineInverterCountHtml`、`faultDisplayNames`、`displayValue`、`beijing-sun` 等核心函数在 Live 和离线路径中共享。`online-inverter-count.ts` 输出完全相同的 HTML。

---

## 7. REST API 端点

| 路径 | 方法 | 参数 | 返回 |
|---|---|---|---|
| `/api/devices` | GET | `page`, `pageSize`, `q`, `status` | 设备列表 + 汇总统计 |
| `/api/devices/[sn]` | GET | — | 设备摘要 + 最新数据 + 绑定关系 |
| `/api/devices/[sn]/latest` | GET | `inverterIndex` | 最新遥测行（500 条） |
| `/api/devices/[sn]/telemetry` | GET | `metric`（必填）, `days`, `inverterIndex` | 时序数据点数组 |
| `/api/devices/[sn]/history` | GET | `days` | 平台 + 微逆连通性历史 |
| `/api/devices/[sn]/alarms` | GET | `days` | 逆流告警区间 |
| `/api/devices/[sn]/health` | GET | — | 设备 + 微逆在线状态 |
| `/api/devices/[sn]/raw-excel` | GET | — | 原始 Excel 二进制下载 |
| `/api/devices/[sn]/inverters/[index]/latest` | GET | — | 微逆摘要 |
| `/api/devices/[sn]/inverters/[index]/telemetry` | GET | `metric`（必填）, `days` | 微逆时序数据 |
| `/api/imports/excel` | POST | `{filePath}` | 导入结果 |
| `/api/live` | GET | — | 同步状态指纹 |
| `/api/live` | POST | — | 触发 `revalidatePath` |

所有 GET 端点统一错误处理：`ZodError → 400`，其它异常向上抛出。验证逻辑集中在 `src/domain/validation.ts`。

---

## 8. 部署

### 8.1 Docker Compose 双服务

```yaml
services:
  app:     # Web 服务（npm run start）
  sync:    # 同步 Worker（npm run source:worker），profile: sync
```

两个服务共享同一个 SQLite 文件（`app-data` volume）。SQLite 繁忙时 Worker 重试 3 次后放弃。

### 8.2 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `APP_DATABASE_URL` | `file:../data/device-monitor.db` | SQLite 路径 |
| `DATA_RETENTION_DAYS` | `7` | 数据保留天数 |
| `SOURCE_DB_ENABLED` | `false` | 是否启用同步 |
| `SOURCE_SYNC_INTERVAL_SECONDS` | `10` | 同步间隔 |
| `MONGODB_URI` | — | MongoDB 连接字符串 |
| `MONGODB_DATABASE` | — | MongoDB 数据库名 |

---

## 9. 项目质量

### 9.1 测试覆盖

| 类型 | 命令 | 数量 |
|---|---|---|
| 单元测试 | `npm run test:unit` | 25 文件，88 测试 |
| 集成测试 | `npm run test:integration` | SQLite 幂等性验证 |
| E2E | `npm run test:e2e` | Playwright 浏览器测试 |
| 离线 HTML | `npm run test:offline-html` | `file://` 无网络验证 |
| 离线图表 | `npm run verify:offline-review-charts` | Playwright `file://` 图表颜色验证 |

### 9.2 已知限制

- 未连接真实公司数据库（二期状态 `PARTIAL`）
- 设备列表筛选和排序在内存中完成，非 SQL 层面
- 逆流检测无迟滞阈值，`-0.01W` 即触发
- 故障严重性判断 `hasCriticalFault` 使用英文正则匹配中文字典，始终返回 `false`
- 图表不降采样，长时间窗口可能性能下降
- CSS 在 Live 和离线路径中独立维护，已产生分歧

### 9.3 验证命令

```bash
npm run typecheck          # TypeScript 类型检查
npm run lint               # ESLint
npm test                   # 单元 + 集成测试
npm run build              # Next.js 构建
npm run test:e2e           # Playwright E2E
npm run verify-data        # 数据质量报告
npm run cleanup -- --dry-run  # 保留策略预览
npm run export:html:demo   # 离线 HTML 导出
npm run test:offline-html  # 离线 HTML 验收
```