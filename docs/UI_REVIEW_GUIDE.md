# UI 人工验收指南

本指南只使用项目内的离线 SQLite Demo 数据，不连接 PostgreSQL、公司数据库、MQTT 或 Source Adapter。

## 启动

在 Windows PowerShell 中执行：

```powershell
npm run prisma:generate
npm run demo:seed
npm run demo
```

浏览器访问 <http://127.0.0.1:3100/devices>。所有页面均按 `Asia/Shanghai` 显示时间，Demo 数据库为 `data/demo-device-monitor.db`，该文件受 Git 忽略。

## Demo CT 场景

| CT SN | 场景 | 建议查看路径 |
| --- | --- | --- |
| `DEMO-CT-ONLINE-001` | 在线正常；固定 8 个微逆通道涵盖发电、待机、离线、限流、丢包、温度变化、未配对和无数据。 | `/devices/DEMO-CT-ONLINE-001` |
| `DEMO-CT-OFFLINE-002` | 最近 7 天活跃、当前离线，保留离线开始与持续时间。 | `/devices/DEMO-CT-OFFLINE-002` |
| `DEMO-CT-REVERSE-003` | A/B/C 三相合成逆流场景；包含已恢复与持续中的告警。 | `/devices/DEMO-CT-REVERSE-003` |

## 建议验收路径

1. 在总览使用“仅在线 CT”“仅离线 CT”“仅逆流告警”筛选，确认离线 CT 没有消失，逆流设备显示红色告警。
2. 打开在线 CT，检查 1～8 微逆卡片：每张卡片保留 SN、软件/硬件版本、在线与工作状态、是否发电、总功率、PV1、PV2、今日/累计发电量、今日发电时长、内部温度、丢包率和故障名称；缺失值显示“—”。
3. 打开离线 CT，确认离线状态、最后上报和离线持续时间仍可查看。
4. 打开逆流 CT，确认 A/B/C 三相独立显示，负功率为红色，告警记录同时存在“已恢复”和“持续中”；点击相位卡片可打开默认 7 天曲线。
5. 打开故障微逆：`/devices/DEMO-CT-REVERSE-003/inverters/1`。页面直接显示 `PV1 输入欠压`、`PV2 输入欠压`、`PV 电压异常`，不会显示 bit 编号或旧的无空格文案。
6. 确认页面不出现 `undefined`、`null` 或 `NaN`。在任一功率图切换 24 小时 / 3 天 / 7 天，勾选或取消曲线，滚轮缩放、拖动时间轴、双击图表或点击“复位缩放”恢复全范围。

## 截图复现

先完成 `npm run demo:seed`，再执行：

```powershell
npm run ui:capture
```

脚本会拒绝并发实例，使用本次运行专属的可用端口、Next.js 构建目录和截图暂存目录，成功后原子发布 6 张桌面和 3 张移动端截图到 `artifacts/ui-review/`。脚本退出时会清理锁、临时构建目录、临时输出目录及它启动的进程树；最终截图目录仍受 Git 忽略。

## 2026-07-22 UI refinement evidence

- CT 和微逆页面支持点击打开历史指标对话框，显示只读数据来源和显著的逆流状态。
- 运行 `npm run test:e2e` 覆盖交互回归，运行 `npm run ui:capture` 重新生成忽略的验收截图。
- 参见 [UI_REAL_LOG_REFERENCE_AUDIT.md](UI_REAL_LOG_REFERENCE_AUDIT.md) 和 [UI_REAL_LOG_REFINEMENT_REPORT.md](UI_REAL_LOG_REFINEMENT_REPORT.md) 了解真实日志参考边界与本轮改进。
