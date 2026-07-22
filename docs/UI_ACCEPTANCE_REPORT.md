# UI 验收交付报告

UI_ACCEPTANCE_STATUS: READY

## 1. 基线验证

在 `c0518ec` 的隔离工作树中完成 `npm install`、`npm run prisma:generate`、`npm run typecheck`、`npm run lint`、`npm test` 和 `npm run build`，均通过。原始 E2E 固定占用 3100 端口和同名 SQLite fixture，已改为专用 3101 端口与 `e2e-ui-acceptance.db`，避免干扰 Demo 预览。

## 2. Demo 数据覆盖

`scripts/seed-demo.ts` 创建 3 台 CT、7 天小时级功率遥测和 5 分钟平台心跳。涵盖在线、近期活跃离线、当前严重逆流、已恢复与持续中逆流告警、8 张微逆卡片状态、限流、丢包、温度变化、PV 数据和 `0x00400C00` 故障掩码。

## 3. 总览页完成情况

`/devices` 已改为中文“防逆流设备运行总览”，具有 SN 搜索、在线/离线/逆流筛选、四项汇总指标、结构化设备清单、离线灰显和逆流红标。

## 4. CT 页面完成情况

CT 详情页保留既有动态服务，补齐运行 KPI、A/B/C 三相逆流区、可读告警记录、离线持续时间、主功率图和固定 1～8 微逆区域。

## 5. 微逆卡片完成情况

在线、离线、未配对和无数据状态独立呈现；卡片显示 SN、版本缺失占位符、功率、PV1/PV2、发电状态、温度、丢包、功率限制及直接可读故障名。

## 6. 微逆详情完成情况

详情页显示型号/SN、软件/硬件/Sub1G 版本、在线与工作状态、两行 KPI、通信与接入信息、故障变化、主功率图和内部温度图。

## 7. ECharts 交互

保留 1/3/7 天、曲线勾选、tooltip、inside/slider dataZoom、滚轮缩放、拖动、双击复位和“复位缩放”按钮；负功率点以红色散点标注。

## 8. 桌面截图

已生成：总览、在线/离线/逆流 CT、在线/离线/故障微逆，共 7 张；位于 `artifacts/ui-review/`（忽略文件）。

## 9. 移动端截图

已生成：总览、CT 详情、微逆详情，共 3 张；视口为 390×844，位于 `artifacts/ui-review/`（忽略文件）。

## 10. 测试命令与结果

`npm run prisma:generate` 在隔离的 `c0518ec` 基线工作树中通过。最终代码工作树的同一命令会被原先存在的 3100 Next 预览进程锁住 Prisma 引擎文件，因此没有终止该用户进程；本轮没有修改 Prisma schema 或生成客户端契约。

最终运行并通过：`npm run typecheck`、`npm run lint`、`npm test`（6 个文件、8 项）、`npm run build`、`npm run test:e2e`（3/3）、`npm run demo:seed` 和 `npm run ui:capture`（10 张）。

## 11. 修改文件

`app/page.tsx`、`app/layout.tsx`、`app/devices/page.tsx`、`app/devices/[sn]/page.tsx`、`app/devices/[sn]/inverters/[index]/page.tsx`、`app/globals.css`、`src/components/telemetry-chart.tsx`、`src/domain/validation.ts`、`src/repositories/device-repository.ts`、`src/services/device-service.ts`、`playwright.config.ts`、`tests/e2e/device-flow.spec.ts`、`tests/e2e/seed.ts`、`package.json`、`.gitignore`。

## 12. 新增文件

`scripts/seed-demo.ts`、`scripts/start-demo.ts`、`scripts/capture-ui-review.ts`、`docs/UI_REVIEW_GUIDE.md`、`docs/UI_ACCEPTANCE_REPORT.md`。

## 13. 已知视觉限制

截图使用本机可用的系统中文字体；不同 Windows 字体回退可能造成极轻微字宽差异。Demo 生成时间以当前时间为基准，数值会随重新种子而变化。

## 14. 本地预览命令

```powershell
npm run demo:seed
npm run demo
```

访问 <http://127.0.0.1:3100/devices>。

## 15. Git 分支和提交状态

目标分支为 `codex/phase2-ui-acceptance`，仅允许本地提交；不推送、不合并到 `main`，等待人工页面验收反馈。
