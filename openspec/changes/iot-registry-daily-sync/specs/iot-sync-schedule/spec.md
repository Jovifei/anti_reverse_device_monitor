## ADDED Requirements

### Requirement: Cron 路由执行 IoT 同步
Next.js 应用 MUST 提供 `POST /api/cron/sync-iot` 路由，调用时执行 `npm run devices:sync-iot`（不传 `--dry-run`），返回 `{status, total, added, updated, removed, pages, durationMs, output, warnings}` JSON 报告。

#### Scenario: 鉴权通过
- **WHEN** 携带 `Authorization: Bearer ${CRON_SECRET}` 调用 `POST /api/cron/sync-iot`
- **THEN** MUST 执行同步脚本，HTTP 200，返回 JSON 报告

#### Scenario: 鉴权失败
- **WHEN** 缺失或错误的 Authorization header
- **THEN** MUST 返回 HTTP 401，body `{error: "unauthorized"}`，不执行同步

#### Scenario: CRON_SECRET 未配置
- **WHEN** 进程启动时 `CRON_SECRET` 环境变量缺失
- **THEN** 路由 MUST 返回 HTTP 503，body `{error: "cron secret not configured"}`

#### Scenario: 同步执行失败
- **WHEN** `npm run devices:sync-iot` 退出码非 0
- **THEN** MUST 返回 HTTP 500，body 含 `{status: "error", error: string}`，并把 stderr 前 500 字符写入响应

#### Scenario: GET 请求拒绝
- **WHEN** 用 `GET /api/cron/sync-iot`
- **THEN** MUST 返回 HTTP 405

### Requirement: WorkBuddy automation 每日 0:00 调度
WorkBuddy automation MUST 在每天 0:00（北京时间）调用 `POST /api/cron/sync-iot`，调用时携带 `CRON_SECRET` 作为 Bearer 鉴权。

#### Scenario: 定时触发
- **WHEN** 北京时间 0:00 整点
- **THEN** automation MUST 在 ±5 分钟内执行一次 POST 调用，body 为空

#### Scenario: 失败重试
- **WHEN** automation 收到 HTTP 500 或网络错误
- **THEN** MUST 重试 3 次，间隔 5/15/60 分钟；3 次均失败 MUST 留错误日志，不影响下一次 0:00 触发

#### Scenario: automation 列表可见
- **WHEN** 通过 `automation_update --mode list` 查询
- **THEN** MUST 看到该 automation 的 name、rrule、status=ACTIVE

### Requirement: 失败可观测
同步失败 MUST 在 server log 与 automation history 中可追溯。

#### Scenario: 同步脚本输出落库
- **WHEN** cron 路由完成执行
- **THEN** MUST 在 server 日志打印一行 `iot sync: status=ok|error total=N added=A updated=U removed=R durationMs=MS`

#### Scenario: 失败告警
- **WHEN** automation 连续 2 个 0:00 都失败
- **THEN** server log MUST 输出 `iot sync: 2 consecutive failures` 警告（不阻塞调度）
