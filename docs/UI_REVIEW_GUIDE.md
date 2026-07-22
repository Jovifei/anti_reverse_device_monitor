# UI 人工验收指南

本指南只使用项目内的离线 SQLite Demo 数据，不连接 PostgreSQL、公司数据库、MQTT 或 Source Adapter。

## 启动

在 Windows PowerShell 中执行：

```powershell
npm install
npm run prisma:generate
npm run demo:seed
npm run demo
```

浏览器访问：<http://127.0.0.1:3100/devices>

所有页面时间均按 `Asia/Shanghai` 显示。Demo 数据库为 `data/demo-device-monitor.db`，该文件受到 `.gitignore` 忽略。

## Demo CT 场景

| CT SN | 场景 | 建议查看路径 |
| --- | --- | --- |
| `DEMO-CT-ONLINE-001` | 在线正常；6 台已绑定微逆，包含发电、待机、离线、限流、丢包、温度变化、未配对与无数据卡片。 | `/devices/DEMO-CT-ONLINE-001` |
| `DEMO-CT-OFFLINE-002` | 最近 7 天活跃、当前离线，保留离线开始与持续时间。 | `/devices/DEMO-CT-OFFLINE-002` |
| `DEMO-CT-REVERSE-003` | A 相当前严重逆流；包含一段已恢复告警与一段持续中的告警。 | `/devices/DEMO-CT-REVERSE-003` |

## 建议验收路径

1. 在总览使用“仅在线 CT”“仅离线 CT”“仅逆流告警”筛选，确认离线 CT 没有从总览消失，逆流设备显示红色告警。
2. 打开在线 CT，检查 1～8 微逆卡片：1 为在线发电、2 为在线待机、3 为离线、4 为限流发电、6 有丢包率与温度变化、7 为未配对、8 为无数据。
3. 打开离线 CT，确认离线状态、最后上报和离线持续时间仍可查看。
4. 打开逆流 CT，确认 A/B/C 三相独立显示，A 相负功率为红色，告警记录同时存在“已恢复”和“持续中”。
5. 打开故障微逆：`/devices/DEMO-CT-REVERSE-003/inverters/1`。页面直接显示 `PV1输入欠压`、`PV2输入欠压`、`PV电压异常`，不会显示 bit 编号。
6. 在任一功率图切换 1 / 3 / 7 天，勾选或取消曲线，滚轮缩放、拖动时间轴、双击图表或点击“复位缩放”恢复全范围。图表同时具备 tooltip、inside dataZoom 和 slider dataZoom。

## 截图复现

先完成 `npm run demo:seed`，再执行：

```powershell
npm run ui:capture
```

脚本使用独立的 3102 端口，输出 7 张桌面和 3 张移动端截图至 `artifacts/ui-review/`；该目录不会提交到 Git。
