---
comet_change: offline-html-export
role: technical-design
canonical_spec: openspec
---

# 离线 HTML UI 导出 — 技术设计

## 1. 背景与目标

在已有 Next.js + Prisma + SQLite 动态监控页之上，交付可断网、可 `file:///` 双击打开的离线快照：单设备单文件、多设备 Bundle、ZIP，以及从 SQLite / Demo / Excel 导出的 CLI。业务语义必须复用现有服务与 domain，不得另起规则。

Canonical 需求：`openspec/changes/offline-html-export/specs/offline-html-export/spec.md`。

## 2. 架构

```text
SQLite | Demo seed | Excel→临时 SQLite
        │
        ▼
 DeviceService / TelemetryService / domain(monitoring,faults,dictionaries)
        │
        ▼
 Offline ViewModel (JSON-serializable)
        │
        ├─► single-file HTML (inline CSS + echarts + runtime + VM)
        └─► bundle/ (index + device_* + inverter_* + assets/echarts.min.js)
                │
                ▼
            ZIP + optional review screenshots
```

### 2.1 模块边界

| 模块 | 职责 |
|---|---|
| `build-*-view-model.ts` | 调用现有服务，产出稳定 VM；缺失值规范为 `"—"` |
| `render-html.ts` / `styles.ts` / `client-runtime.ts` | 纯展示与交互；禁止 `fetch`/CDN |
| `echarts-asset.ts` | 读取 `node_modules/echarts/dist/echarts.min.js` |
| `package-export.ts` | 写文件、Bundle、ZIP、安全文件名 |
| `cli.ts` + `scripts/export-offline-html.ts` | 参数解析与编排 |

### 2.2 数据流细节

- **SQLite**：`--db` 或 `APP_DATABASE_URL` 指向监控库；导出前不修改业务表。
- **Demo**：复用 `scripts/seed-demo.ts` / `demo:seed`；`export:html:demo` 生成规定文件名与 ZIP。
- **Excel**：临时目录建空库 → `db push` → 复用 `ExcelSourceAdapter` + 现有 upsert 导入 → 导出 → `finally` 删除临时库与连接。

### 2.3 单文件 vs Bundle

- **单文件**：一个 `.html`；内嵌 CSS、client-runtime、ECharts、`window.__OFFLINE_VM__`。
- **Bundle**：`assets/echarts.min.js` 相对引用；每页内嵌或共享 runtime；`index.html` ↔ `device-{sn}.html` ↔ `inverter-{sn}-{index}.html` 相对链接；附 `README.txt`。

## 3. ViewModel 与页面内容

与现有 `app/devices/[sn]/page.tsx` 聚合对齐：

- 顶栏：CT 状态、电网质量摘要、只读数据来源、最后上报、当前逆流。
- 逆流面板：ABC 功率、负值红标、告警开始/持续、历史告警列表；相卡片可弹窗曲线。
- 功率总览：默认 load/grid/generation，可单/双/三；1/3/7、缩放拖动 slider、复位。
- 电网质量：电压/频率最新值 + 曲线。
- 能源：仅今日电量、今日时长、累计电量。
- 固定 8 微逆卡片：`online_state` 视觉（在线/离线/未配对/无数据）、可点指标弹窗；详情页含故障变化与离线区间。
- 故障：`faultDisplayNames` / `toHexMask`；文案含正确空格（如 `PV1 输入欠压`）。
- 今日发电跨日：series 在跨日处置 `null` 断点。

辅助：`escapeHtml`、`safeFileToken(sn)`。

## 4. CLI 契约

脚本：`export:html`、`export:html:demo`、`export:html:excel`、`test:offline-html`。

参数：`--sn` `--all` `--days` `--db` `--excel` `--demo` `--single-file` `--bundle` `--out` `--title` `--help`。

非法组合：stderr 明确错误、非零退出、不写半成品。

## 5. 测试策略

1. **Unit**：VM 字段、缺失值、逆流、故障、离线窗、跨日断线、escape、文件名。
2. **Integration**：Demo/Excel 路径、单文件、Bundle、ZIP、重复导出、自定义 `--out`。
3. **Playwright offline**：`file:///`；`route` 拦截 http(s) 即失败；图表/弹窗/颜色/无脏字符串；Bundle 跳转。
4. **截图**：`artifacts/offline-ui/review/*.png`（gitignore）。

## 6. 文档与 Git 边界

- 新增：`docs/OFFLINE_HTML_EXPORT_GUIDE.md`、`docs/OFFLINE_HTML_EXPORT_REPORT.md`
- 更新：`README.md`、`docs/05_*`、`docs/06_*`
- ignore：`artifacts/offline-ui/`；不提交 DB/Excel/HTML/ZIP/真实 SN 数据
- 提交信息：`feat: add offline HTML dashboard export`（本地，不推送）

## 7. 实施顺序

1. 分支与基线门禁  
2. ViewModel 层  
3. 渲染/runtime/打包  
4. CLI 与三数据源  
5. 测试与截图  
6. 实际导出产物 + 文档 + 本地提交  

## 8. 非目标

公司库、PostgreSQL、MQTT、控制/OTA、CDN、仅启动 Next 冒充离线交付。
