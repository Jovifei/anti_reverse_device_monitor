# 防逆流设备运行可视化系统

只读观察系统：Next.js + TypeScript + Prisma + SQLite。从公司 Mongo `device_log_*`（或 Excel）同步到本地库后，按 CT SN 查看最近约 7 天的运行、逆流与微逆状态。浏览器不持有数据库密码；不具备 MQTT/OTA/参数下发/配对解绑。

## 日常运行（推荐）

1. 配置 `.env.local`（自 `.env.local.example`），填 Mongo，并设 `SOURCE_DB_ENABLED=true`、`SOURCE_DB_TYPE=mongodb`
2. 准备 `config/device-sn-map.xlsx`（SN ↔ device_id）
3. 双击或执行：`.\start-monitor.ps1`  
   （迁移 → 应用 SN 映射 → `source:sync` → 开 `source:worker` → 起 Next 并打开浏览器）
4. 打开 `http://localhost:3000/devices`

完整说明见 [操作手册](docs/11_OPS_RUNBOOK.md)。

手工拆分：

```bash
npm install
npm run devices:apply-map
npm run source:sync
npm run source:worker   # 另开终端常驻
npm run dev
```

## 主要能力

- 完整 SN 或可唯一识别的末尾编号查询；
- 总览优先卡：正在逆流 / 近7天长时逆流(≥40分钟) / 待处理离线 / 存在离线微逆 / 在线活跃；
- CT 运行状态、三相反送告警、1/3/7 天功率与电网质量曲线；
- 固定 1～8 微逆卡片及微逆详情；在线微逆个数、离线通道标注；
- online_state、工作状态、故障位掩码字典解码；
- Mongo 只读增量同步（独立 Worker + checkpoint）；
- 总览软刷新：指纹变化才刷新；**详情页不自动 soft-refresh**（防 Next 卡死）；
- 离线 HTML 导出；Docker Compose（Web + Sync Worker）。

## 技术文档

| 文档 | 说明 |
|------|------|
| [docs/README.md](docs/README.md) | 文档索引 |
| [操作手册](docs/11_OPS_RUNBOOK.md) | 启动、同步、卡死恢复、Docker |
| [项目总览](docs/01_PROJECT_OVERVIEW.md) | 背景与业务问题 |
| [当前完成情况](docs/05_CURRENT_STATUS_AND_DELIVERABLES.md) | 交付与限制 |
| [Mongo 只读说明](docs/MONGODB_READONLY_SOURCE.md) | 联调与 Docker 命令 |
| [技术路线学习](docs/10-STUD-学习/01-STUD-技术路线总览.md) | 实现原理 |

## 验证命令

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run verify-data
```

## Docker（正式）

```bash
copy .env.docker.example .env.docker
# 编辑密钥与 SOURCE_DB_ENABLED=true
docker compose up --build -d
docker compose --profile sync up -d sync
```

详见 [操作手册 §6](docs/11_OPS_RUNBOOK.md#6-docker-部署正式)。

## 二期说明

真实 Mongo 只读联调已在本地可用（取决于你的 `.env.local`）。字段映射与 Adapter 合同见 `docs/PHASE2_*` 与 `docs/MONGODB_READONLY_SOURCE.md`。
