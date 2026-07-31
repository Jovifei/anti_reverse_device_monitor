# UI 验收交付报告

UI_ACCEPTANCE_STATUS: READY

## 当前审阅包

- 分支：`codex/phase2-ui-acceptance`
- 截图生成基线：`c7866ad`
- 生成时间：`2026-07-23T15:14:14.6897475Z`
- 端口：`3100`
- 截图：17 张（桌面 12 张，移动 5 张）
- 视口：桌面 `1440x900`；移动 `390x844`
- 索引：[artifacts/ui-review/REVIEW_INDEX.md](../artifacts/ui-review/REVIEW_INDEX.md)
- 清单：[artifacts/ui-review/review-manifest.json](../artifacts/ui-review/review-manifest.json)

## 场景覆盖

截图覆盖设备总览、在线/离线/逆流 CT、三相历史弹窗、八台微逆网格、在线/离线/故障微逆详情、微逆指标弹窗、离线区间、逆流告警记录，以及移动端总览、CT 顶部紧凑布局、微逆网格、详情和全屏弹窗。

## 门禁记录

以下命令已在本轮通过：

```text
npm run prisma:generate
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e       # 7/7
npm run demo:seed
npm run verify-data   # APP_DATABASE_URL=file:../data/demo-device-monitor.db
npm run cleanup -- --dry-run  # APP_DATABASE_URL=file:../data/demo-device-monitor.db
npm run ui:capture     # screenshot_count=17
git diff --check
```

Demo 数据保持 7 天曲线，当前在线 CT 为 2、当前离线 CT 为 1、严重逆流设备为 1。截图脚本使用临时端口和构建目录，退出时清理浏览器、Next 进程、锁文件和临时目录。
