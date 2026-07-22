# 二期验收报告

## 1. 二期目标

交付公司数据源只读接入的安全框架、字段映射验证、稳定增量同步、SQLite 审计落库与多设备联调准备，不重建一期页面或控制通道。

## 2. 验收状态

`PHASE2_STATUS: PARTIAL`。

离线可验证部分已通过；本机不存在 `.env.local` 中的真实只读连接、只读权限证明、源数据库类型/视图和本地字段映射，故真实源探查、属性同步与真实多设备联调不能诚实标记为完成。

## 3. 数据源、权限与字段映射

- 数据源类型：未配置。
- 只读权限：未验证，未尝试连接。
- 映射：`source-field-mapping.example.json` 校验通过，强制覆盖唯一 ID、SN、SIID、PIID、微逆序号、两个时间、值和值类型；真实映射应放在已忽略的 `config/source-field-mapping.local.json`。
- 探查：`npm run source:inspect` 生成脱敏报告，未记录连接字符串、密码、Token 或原始行。

## 4. Adapter、游标与同步审计

- `SourceTelemetryAdapter` 现在提供健康状态、最近记录时间、查询耗时、分页和复合 `SourceCursor`。
- Mock Adapter 固定按 `reportedAt ASC, sourceRecordId ASC` 排序，避免同时间记录遗漏。
- `SourceSyncService` 使用 Zod 校验、指标键回退、SQLite 幂等 source ID、`SyncCheckpoint`、`SyncBatch` 与 `SyncError`；失败不推进 checkpoint。
- 真实 Adapter 仍是无 SQL、无驱动的安全 Stub，直到获批的数据源类型、只读视图和字段映射到位。

## 5. 属性和真实多设备联调

真实 CT/微逆属性与真实多设备场景均未执行，因为源 SIID/PIID 定义和只读连接缺失。现有一期页面继续从本地 SQLite 与既有 Service/Repository 提供动态查询；缺失值仍显示 `—`。

## 6. 数据库与 migration

新增 `0003_source_sync_audit`：`Telemetry.sourceName`、`SyncCheckpoint.lastError/lastSuccessAt`、`SyncBatch`、`SyncError` 与索引。已验证：全新 SQLite、模拟一期 `0001/0002` 升级库、独立测试 SQLite，三者均能部署 `0003`。

## 7. 验证结果

| 命令 | 结果 |
|---|---:|
| `npm run prisma:generate` | 0 |
| `npm run typecheck` | 0 |
| `npm run lint` | 0 |
| `npm test` | 0，6 个单测文件、8 条断言，SQLite 集成通过 |
| `npm run build` | 0 |
| `npm run test:e2e` | 0，Chromium 1/1 |
| `npm run verify-data` | 0 |
| `npm run cleanup -- --dry-run` | 0 |
| `npm run source:validate-mapping` | 0，示例映射有效 |
| `npm run source:sync -- --dry-run` | 0，未配置源库的安全演练 |
| `npm audit` | 1，发现 4 项上游漏洞，详见依赖报告 |

## 8. 性能、查询压力与限制

Mock 分页为批量边界准备，默认批量为 1000，查询超时配置为 15 秒；真实源未连接，无法提供真实同步延迟或压力数据。生产 PostgreSQL 前仍需确认源数据量、只读副本容量、索引、时区、单位和保留策略。

## 9. 三期资格

二期离线同步基础具备，三期 PostgreSQL 前置条件未满足：批准的只读连接、真实字段映射、真实多设备验收、属性 SIID/PIID 映射、压力与延迟基线，以及漏洞处理方案。
