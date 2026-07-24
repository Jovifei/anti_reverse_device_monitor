# 离线 HTML 导出指南

## 从 Demo 导出

```powershell
npm run demo:seed
npm run export:html:demo
```

产物目录：`artifacts/offline-ui/`

- 单文件：`demo-device-DEMO-CT-ONLINE-001.html` 等
- Bundle：`bundle/index.html`
- ZIP：`anti-reverse-device-ui-demo.zip`

## 从 SQLite 导出

```powershell
npm run export:html -- --db data/device-monitor.db --all --days 7 --bundle --single-file
```

或设置：

```env
APP_DATABASE_URL=file:../data/device-monitor.db
```

## 从 Excel 导出

```powershell
npm run export:html:excel -- "E:\path\device.xlsx"
npm run export:html:excel -- "E:\path\device.xlsx" --sn GC2001000000252 --single-file --bundle
```

流程：Excel → 临时 SQLite → 现有导入器 → 离线 HTML → 清理临时库。

## 查看

1. 双击生成的 HTML；或
2. 解压 ZIP 后打开 `bundle/index.html`

无需 Next.js、无需数据库、无需联网。禁止提交真实 Excel、数据库与生成 HTML/ZIP。
