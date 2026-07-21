# 防逆流设备运行可视化系统

> Anti-Reverse Device Monitor — CT 防逆流电表与微型逆变器运行监控 Web 系统

---

## 项目概述

本项目是面向工程、售后和运维人员的**防逆流 CT 电表运行可视化 Web 系统**。

每台防逆流 CT 电表最多绑定 **8 台微型逆变器**。CT 电表检测电网电流方向和功率大小，向微逆下发限流控制，目标是**允许微逆发电，但禁止发出的电反送到公共电网**。

系统核心能力：

- 查询哪些 CT 设备最近活跃，当前是否在线
- 实时监测 A/B/C 三相是否发生**向电网反送功率**（严重逆流告警）
- 展示家庭负载、电网功率和微逆总发电功率曲线
- 展示今日发电量、累计发电量和今日发电时长
- 8 台微逆各自独立展示：在线状态、工作状态、PV1/PV2 功率、温度、丢包率、故障
- 最近 7 天连续数据、上下线记录、离线时长和故障变化历史
- 通过 SN 快速切换查看不同设备

---

## 当前进度

### ✅ 已完成：Phase 0 — 离线原型验证

- V4 多页面 HTML 原型，使用真实设备日志验证了完整的页面结构和交互
- 状态字典、故障字典、指标字典定义
- 项目需求、架构、数据模型等全套设计文档

### 🚧 进行中：Phase 1 — SQLite 动态 MVP（当前阶段）

**后端已搭建：**

| 层次 | 内容 |
|------|------|
| 数据模型 | Prisma Schema — Device、InverterBinding、Telemetry、DeviceLatest、DeviceEvent、FaultEvent、ReverseFlowAlert、ImportBatch、SyncCheckpoint |
| 领域层 | 状态枚举、故障位解码、指标字典、数据校验 |
| 数据适配 | Fixture（测试数据）、Excel 导入、Source DB 占位 |
| 仓库层 | DeviceRepository、TelemetryRepository |
| 服务层 | DeviceService、TelemetryService |
| API 路由 | 设备列表、设备详情、最新值、遥测曲线、健康检查、告警、Excel 导入（共 12 个端点） |
| 页面骨架 | 首页 `/`、设备列表 `/devices`、设备详情 `/devices/[sn]`、微逆详情 `/devices/[sn]/inverters/[index]` |
| 脚本工具 | Excel 数据导入、7 天数据清理、数据验证报告 |

**待完成：**

- ECharts 图表组件集成
- 完整的页面 UI 实现（参考 V4 原型）
- 单元测试 / 集成测试 / E2E 测试
- 离线 HTML 快照导出

---

## 未来路线图

```
Phase 0 (完成)          Phase 1 (进行中)        Phase 2              Phase 3              Phase 4              Phase 5
原型验证                  SQLite MVP              公司数据库接入          PostgreSQL 生产化     实时与告警中心         产品化与扩展
    │                        │                       │                     │                    │                    │
    └────────────────────────┼───────────────────────┼─────────────────────┼────────────────────┼────────────────────┘
```

### Phase 2 — 公司数据库只读接入

从公司数据库自动同步多设备数据，替代手动 Excel 导入：
- 公司数据库只读账号 + 专用视图
- 增量同步 Worker + 游标 + 断点续传
- 多设备总览、真实微逆 SN、版本、相位和接入点

### Phase 3 — PostgreSQL 生产化

迁移到生产级数据库，支持更多设备和并发用户：
- SQLite → PostgreSQL 迁移
- Docker Compose、Nginx/HTTPS
- 公司 SSO/OIDC 登录、RBAC 权限
- 审计日志、备份恢复、性能测试

### Phase 4 — 实时与告警中心

增强实时性和故障处置能力：
- MQTT 只读订阅、SSE/WebSocket 实时推送
- 告警中心（确认、处理中、恢复、关闭）
- 邮件/企业微信通知
- 逆流告警去抖和升级

### Phase 5 — 产品化与扩展

将防逆流监控能力复用到更多设备品类：
- 指标模板管理、产品模型配置
- 多租户/客户维度、地区/项目筛选
- 报告导出、工单联动
- 设备控制、OTA、配对解绑（单独安全评审立项）

---

## 技术栈

| 分类 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript |
| ORM | Prisma |
| 数据库 | SQLite（Phase 1）→ PostgreSQL（Phase 3） |
| 图表 | Apache ECharts |
| 数据校验 | Zod |
| Excel 解析 | SheetJS (xlsx) |
| 测试 | Vitest + Playwright |
| 图表交互 | 缩放、平移、1/3/7 天切换 |

---

## 环境配置

### 1. 环境要求

- Node.js ≥ 18
- npm ≥ 9

### 2. 克隆项目

```bash
git clone https://github.com/Jovifei/anti_reverse_device_monitor.git
cd anti_reverse_device_monitor
```

### 3. 安装依赖

```bash
npm install
```

### 4. 配置环境变量

复制环境变量模板并修改：

```bash
cp config/.env.local.example .env.local
```

关键配置项说明：

```bash
# 应用数据库（Phase 1 使用 SQLite）
APP_DATABASE_URL=file:./data/device-monitor.db

# 数据保留天数（默认 7 天，超期自动清理）
DATA_RETENTION_DAYS=7

# Excel 导入目录
IMPORT_DIRECTORY=./data/imports

# 导入时区
IMPORT_TIMEZONE=Asia/Shanghai

# Phase 1 阶段关闭源数据库同步
SOURCE_DB_ENABLED=false

# 前端可见的应用名称
NEXT_PUBLIC_APP_NAME=防逆流设备运行可视化
```

> ⚠️ **安全提醒**：`.env.local` 包含数据库连接信息，已被 `.gitignore` 排除，**禁止提交到 Git**。

### 5. 初始化数据库

```bash
npx prisma generate
npx prisma migrate dev
```

### 6. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000` 查看系统。

---

## 数据导入

### 从 Excel 导入

```bash
npm run import:excel <excel_file_path> [device_sn]
```

- 支持 `.xlsx` / `.xls` 格式
- 自动去重，重复导入不会产生重复数据
- 导入时自动解析状态码和故障位掩码

### 从源数据库导入（Phase 2+）

Phase 2 将支持从公司数据库自动增量同步，无需手动操作。

---

## 日常运维

```bash
# 清理过期数据（超过 7 天的遥测记录）
npm run cleanup

# 生成数据验证报告
npm run verify-data

# 类型检查
npm run typecheck

# 代码检查
npm run lint
```

---

## 项目结构

```
anti_reverse_device_monitor/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # 首页
│   ├── layout.tsx                # 根布局
│   ├── globals.css               # 全局样式
│   ├── devices/                  # 设备页面
│   │   ├── page.tsx              # 设备总览
│   │   └── [sn]/                 # 单设备详情
│   │       ├── page.tsx          # CT 设备面板
│   │       └── inverters/
│   │           └── [index]/      # 微逆详情
│   └── api/                      # API 路由
│       ├── devices/              # 设备接口
│       │   ├── route.ts          # GET/POST 设备列表
│       │   └── [sn]/
│       │       ├── route.ts      # GET 设备信息
│       │       ├── latest/       # GET 最新值
│       │       ├── telemetry/    # GET 遥测曲线
│       │       ├── history/      # GET 7天历史
│       │       ├── health/       # GET 健康状态
│       │       ├── alarms/       # GET 告警列表
│       │       └── inverters/
│       │           └── [index]/
│       │               ├── latest/    # GET 微逆最新值
│       │               └── telemetry/ # GET 微逆遥测曲线
│       └── imports/excel/       # POST Excel 导入
├── src/
│   ├── domain/                   # 领域模型
│   │   ├── faults.ts             # 故障位解码
│   │   ├── dictionaries.ts       # 状态/指标字典
│   │   └── validation.ts         # 数据校验
│   ├── repositories/             # 数据访问层
│   │   ├── device-repository.ts
│   │   └── telemetry-repository.ts
│   ├── services/                 # 业务逻辑层
│   │   ├── device-service.ts
│   │   └── telemetry-service.ts
│   ├── adapters/source/          # 数据源适配器
│   │   ├── excel-adapter.ts      # Excel 导入
│   │   ├── fixture-adapter.ts    # 测试数据
│   │   ├── source-adapter.ts     # 适配器接口
│   │   └── source-db-adapter.ts  # 源数据库（Phase 2）
│   └── lib/
│       └── prisma.ts             # Prisma 客户端
├── prisma/
│   └── schema.prisma             # 数据库模型定义
├── config/                       # 配置文件
│   ├── .env.local.example        # 环境变量模板
│   ├── status_dictionary.json    # 状态字典
│   ├── fault_dictionary.json     # 故障字典
│   └── metric_dictionary.example.json  # 指标字典示例
├── scripts/                      # 运维脚本
│   ├── import-excel.ts           # Excel 导入
│   ├── cleanup-retention.ts      # 数据清理
│   └── verify-data.ts            # 数据验证
├── package.json
├── tsconfig.json
├── next.config.mjs
└── README.md
```

---

## 设计原则

1. **指标元数据驱动**：通过指标字典定义每个字段的展示方式，增加新产品时主要增加配置，而非重写页面
2. **最新状态与历史分离**：`device_latest` 快速加载总览，`telemetry` 用于曲线，`device_events` 用于上下线，`fault_events` 用于故障追踪
3. **设备层级分离**：产品品类 → 产品型号 → CT 设备实例 → 微逆通道 1~8
4. **原始数据与业务语义分离**：状态码、位掩码通过字典映射为可读文本
5. **浏览器零信任**：数据库密码和连接信息仅存在于服务端，浏览器不接触任何生产凭据

---

## 项目边界

Phase 1-2 默认是**只读观察系统**，不包含：

- 远程开关机、修改发电限制、反转 CT 方向
- OTA 固件升级
- 微逆配对和解绑
- 发布 MQTT 控制命令

以上操作需要单独的权限、审计和安全设计，将在后续阶段单独立项。

---

## License

Private — 内部项目，未开源。