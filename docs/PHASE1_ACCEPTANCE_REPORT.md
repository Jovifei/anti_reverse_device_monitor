# 一期验收报告

## 1. 本期目标

将 V4 离线 HTML 原型交付为可安装、可导入 Excel、可按 SN 查询、可在 SQLite 上动态展示 CT 和 8 台微逆最近 7 天运行数据的只读 Web MVP。

## 2. 完成功能

- CT 设备运行页：核心 KPI、状态字典、三相 CT 功率、严重逆流区间、电网质量、平台上下线与离线窗口；
- ECharts：1/3/7 天筛选、曲线复选、Tooltip、滚轮缩放、拖动、slider、双击和按钮复位；
- 1～8 微逆独立卡片：online_state 状态色、PV1/PV2/总功率、温度、丢包率、能源、故障和详情链接；
- 微逆详情：状态/持续时长、功率和温度大图、相位/接入点、故障名称和变化历史；
- Excel 导入、SIID/PIID、去重、数据质量报告；
- retention：telemetry、device events、fault events、reverse flow alerts；
- 二期 Source Adapter 合同、Mock、Stub 和字段映射示例。

## 3. 页面入口

- `/devices`
- `/devices/[sn]`，可输入完整 SN 或唯一末尾编号；
- `/devices/[sn]/inverters/[index]`，`index` 限制为 1～8。

## 4. 数据库与 migration

- `prisma/schema.prisma`：SQLite 兼容的 schema，JSON 载荷以 JSON 文本存储，便于以后 PostgreSQL 迁移时转换；
- `prisma/migrations/0001_init/migration.sql`；
- `prisma/migrations/0002_add_inverter_phase_num/migration.sql`；
- 最新状态不参与 retention；设备、绑定、checkpoint 与导入审计不参与 retention。

## 5. 验证清单

| 命令 | 退出结果 | 证据 |
|---|---:|---|
| `npm run prisma:generate` | 0 | Prisma Client 5.22.0 生成成功 |
| `npm run typecheck` | 0 | `tsc --noEmit` 通过 |
| `npm run lint` | 0 | ESLint CLI 通过 |
| `npm test` | 0 | 5 个 unit 文件、6 个断言；SQLite integration 通过 |
| `npx prisma migrate deploy` | 0 | 在全新 SQLite 文件成功应用 `0001_init` 与 `0002_add_inverter_phase_num` |
| `npm run build` | 0 | Next 15 生产构建通过 |
| `npm run test:e2e` | 0 | Chromium 关键路径 1/1 通过 |
| `npm run verify-data` | 0 | 设备、微逆、telemetry、时间范围、事件、孤立记录和未知指标均已输出 |
| `npm run cleanup -- --dry-run` | 0 | 7 天 retention 仅报告待清理数，未写入 |

## 6. 逆流告警验证

服务按 A/B/C 三相 `active_power_ct1/2/3 < 0` 合并区间，输出开始、恢复/持续中、持续时长、最低功率和样本数。E2E fixture 用 A 相 `-15 W` 验证页面显示严重反送告警。

## 7. 故障解码验证

Unit test 验证 `0x00400C00` 解码为“PV1输入欠压”、“PV2输入欠压”和“PV电压异常”。页面显示故障名称与十六进制原始码，不强调 bit 编号。

## 8. CT 与微逆离线时长验证

Unit test 验证 `online_state = 2` 为在线、`1` 为离线，连续离线在窗口结束时仍保持开放并计算当前离线时长。CT 平台与微逆 online_state 使用独立查询路径。

## 9. retention 验证

SQLite integration test 验证：7 天前的 telemetry/device event/fault event/reverse flow alert 被清理；恰在 7 天边界的 telemetry 被保留；`DeviceLatest` 保留；重复清理结果为 0。dry-run 输出无写入计划。

## 10. 已知限制

- 未连接真实公司数据库，未编造表名、字段或设备元数据；
- 未实现控制、MQTT 发布、OTA、配对/解绑或远程开关机；
- 发电量单位和部分 Excel 指标归属仍待数据源负责人确认；
- `verify-data` 在 E2E fixture 上报告 22 个未知指标，因为示例 metric dictionary 只登记了有限样例；
- `npm install` 报告 3 个上游依赖漏洞，未执行破坏性的 `npm audit fix --force`；
- Playwright Chromium 下载在 `E:\Claude_allow\Download\playwright-browsers`，不在项目仓库中。

## 11. 二期 Adapter 入口

- `src/adapters/source-db/source-telemetry-adapter.ts`
- `src/adapters/source-db/types.ts`
- `src/adapters/source-db/mock-source-adapter.ts`
- `src/adapters/source-db/company-source-adapter.stub.ts`
- `config/source-field-mapping.example.json`
- `docs/PHASE2_SOURCE_ADAPTER_GUIDE.md`

## 12. 真实公司数据库说明

本期未连接、未读取、未写入公司真实生产数据库。二期仅允许服务端使用经批准的只读账号、只读视图或 API；浏览器不接收任何连接信息或密码。
