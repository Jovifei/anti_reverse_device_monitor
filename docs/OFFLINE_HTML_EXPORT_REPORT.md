# 离线 HTML 导出验收报告

## 状态

```text
OFFLINE_HTML_EXPORT_STATUS: PASS
```

## 基线

- 功能分支：`codex/offline-html-export`
- 基线：`origin/codex/phase2-ui-acceptance` @ `1ec67fb`
- Change：`offline-html-export`（Comet Classic）

## 实现结构

- `src/export/offline/`：ViewModel、渲染、runtime、CLI、打包
- `scripts/export-offline-html.ts`：导出入口
- 复用：`DeviceService`、`TelemetryService`、`monitoring.ts`、`faults.ts`、状态/故障字典

## 产物路径（绝对）

- `D:\work\anti_reverse_device_monitor\artifacts\offline-ui\demo-device-DEMO-CT-ONLINE-001.html`（约 1.79 MB）
- `D:\work\anti_reverse_device_monitor\artifacts\offline-ui\demo-device-DEMO-CT-OFFLINE-002.html`（约 1.23 MB）
- `D:\work\anti_reverse_device_monitor\artifacts\offline-ui\demo-device-DEMO-CT-REVERSE-003.html`（约 1.26 MB）
- `D:\work\anti_reverse_device_monitor\artifacts\offline-ui\bundle\index.html`
- `D:\work\anti_reverse_device_monitor\artifacts\offline-ui\anti-reverse-device-ui-demo.zip`（约 561 KB）
- 截图：`D:\work\anti_reverse_device_monitor\artifacts\offline-ui\review\`

## 数据量

Demo seed：3 台 CT，约 27595 条 telemetry。

## 测试

- Unit：utils / CLI / 故障文案（含空格名）通过
- Playwright offline：`file:///` 打开，拦截 HTTP/HTTPS，`blockedRequests: 0`，无控制台错误
- 命令：`npm run test:offline-html`

## 已知限制

- 未提供脱敏 Excel 时，Excel 路径未做现场联调（代码路径已实现）
- 单文件因内嵌 ECharts 体积约 1.2–1.8 MB
- Next.js 在线页与离线页视觉接近但非像素级同一套 React 组件
