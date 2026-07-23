# UI 人工验收指南

本指南只使用项目内的 Demo SQLite 数据，不连接 PostgreSQL、公司数据库、MQTT 或 Source Adapter。

## 启动

```powershell
npm run prisma:generate
npm run demo:seed
npm run demo
```

预览入口：[http://127.0.0.1:3100/devices](http://127.0.0.1:3100/devices)。

## 场景导航

| 场景 | Demo SN / 地址 |
| --- | --- |
| 在线正常 CT | [http://127.0.0.1:3100/devices/DEMO-CT-ONLINE-001](http://127.0.0.1:3100/devices/DEMO-CT-ONLINE-001) |
| 当前离线 CT | [http://127.0.0.1:3100/devices/DEMO-CT-OFFLINE-002](http://127.0.0.1:3100/devices/DEMO-CT-OFFLINE-002) |
| 有逆流告警 CT | [http://127.0.0.1:3100/devices/DEMO-CT-REVERSE-003](http://127.0.0.1:3100/devices/DEMO-CT-REVERSE-003) |
| 在线微逆 | [http://127.0.0.1:3100/devices/DEMO-CT-ONLINE-001/inverters/1](http://127.0.0.1:3100/devices/DEMO-CT-ONLINE-001/inverters/1) |
| 离线微逆 | [http://127.0.0.1:3100/devices/DEMO-CT-ONLINE-001/inverters/3](http://127.0.0.1:3100/devices/DEMO-CT-ONLINE-001/inverters/3) |
| 有故障微逆 | [http://127.0.0.1:3100/devices/DEMO-CT-REVERSE-003/inverters/1](http://127.0.0.1:3100/devices/DEMO-CT-REVERSE-003/inverters/1) |

## 曲线与弹窗检查

1. 在逆流 CT 首屏确认红色严重告警、家庭负载 950 W、微逆总功率 1370 W、电网功率 -420 W，以及 A=-160 W、B=0 W、C=-260 W。
2. 点击 A/B/C 相卡片的“查看 7 天曲线”：主曲线保持相位中性色，负值点为红色，0 W 为红色虚线；没有负值时不应出现空的负值点图例。
3. “功率总览”默认只勾选家庭负载、电网、微逆发电总功率；展开“更多曲线”后检查 CT/微逆相位曲线。范围选择支持 1 天、3 天、7 天，Tooltip、滚轮缩放、拖动和复位均可用。
4. 微逆卡片中的总功率、PV1、PV2、今日发电量、内部温度本身可点击打开历史弹窗。移动端弹窗应覆盖 390×844 视口，标题和关闭按钮可见，ESC/遮罩/关闭按钮均能关闭并恢复页面滚动。
5. 在线微逆 1 应显示正功率和“正在发电”；在线待机微逆 2 显示 0 W 和“否”；离线微逆 3 显示 0/— 和“—”。详情页配置应显示“开启/关闭”和“100 W”。
6. 离线 CT 页面所有功率、电压、频率和 Sub1G 状态均标注“最后已知”及更新时间，不应被误认为实时值。

## 当前审阅包

- 基线分支：`codex/phase2-ui-acceptance`
- 截图基线提交：`c7866ad`
- 截图数量：17 张（桌面 12 张，移动 5 张）
- 桌面视口：`1440 × 900`
- 移动视口：`390 × 844`
- 端口：`3100`
- 文件索引：[artifacts/ui-review/REVIEW_INDEX.md](../artifacts/ui-review/REVIEW_INDEX.md)
- 清单：[artifacts/ui-review/review-manifest.json](../artifacts/ui-review/review-manifest.json)
