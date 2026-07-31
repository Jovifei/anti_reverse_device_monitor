---
change: mongo-log-source-adapter
design-doc: docs/superpowers/specs/2026-07-31-mongo-log-source-adapter-design.md
base-ref: 90bcc39853f483486572c7ad85d0205019a796eb
---

# Mongo 日志只读接入 — 实施计划

> **For agentic workers:** 按任务逐步执行；每步标记完成后勾选 `tasks.md` / 本计划。优先 TDD。语言：zh-CN。

**Goal：** 用两台已知 `device_id` 只读拉 Mongo 做联调；注册表在服务端保存 SN↔device_id；**交互页面只出现 SN，不出现 device_id**。完整映射表/查询网址后续再接。

**Architecture：** Mongo 只读 → Adapter（按 device_id 查）→ Sync → Prisma → `/devices`（仅 SN）。

**Tech Stack：** Next.js、mongodb 驱动、Prisma/SQLite、Docker（app + sync profile）。

---

## 文件职责

| 文件 | 职责 |
|------|------|
| `src/adapters/source-db/mongo-defaults.ts`（新） | 品类默认常量 `689adc659f04ec32f7642fbb` |
| `config/devices.example.json` | 两台联调设备 SN↔device_id（服务端用） |
| `src/domain/device-identity.ts` + `app/devices/**` | UI 只展示 SN；去掉 device_id 文案 |
| `Dockerfile` / `docker-compose.yml` / `.dockerignore` | 应用部署；sync 分离 |
| `docs/MONGODB_READONLY_SOURCE.md` | 联调步骤；UI 不含 device_id；映射后续扩展 |

---

### Task 1：品类默认 + 联调注册表示例

**Files:** `src/adapters/source-db/mongo-defaults.ts`, `mongo-log-source-adapter.ts`, `config/devices.example.json`, 单测

- [x] 新增 `DEFAULT_CT_PRODUCT_ID = '689adc659f04ec32f7642fbb'`
- [x] Adapter 在 env 未设时使用该默认并推导集合名
- [x] `devices.example.json` 写入两台联调设备
- [x] 单测覆盖默认品类

### Task 2：交互层隐藏 device_id

- [x] Primary/列表/详情/搜索：只显示与输入 SN
- [x] 删除 device_id 文案
- [x] 更新 `device-identity` 单测

### Task 3：联调文档

- [x] 更新 `docs/MONGODB_READONLY_SOURCE.md`

### Task 4：Docker 打包

- [x] Dockerfile、compose、`.dockerignore`、`.env.docker.example`

### Task 5：收尾

- [x] `npm run test:unit` + `npm run typecheck`
