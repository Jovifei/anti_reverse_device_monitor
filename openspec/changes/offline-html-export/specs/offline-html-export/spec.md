## ADDED Requirements

### Requirement: Offline single-file device dashboard
系统 MUST 能为指定 CT SN 生成一份自包含单文件 HTML：内嵌 CSS、JavaScript、ECharts 运行时与设备 ViewModel；MUST NOT 引用 CDN、远程资源或在页面中使用 `fetch()`；用户 MUST 能通过 `file:///` 双击打开并在断网下使用图表与交互。

#### Scenario: Demo online device single-file export
- **WHEN** 用户对 Demo 库执行单文件导出且 SN 为 `DEMO-CT-ONLINE-001`
- **THEN** 生成可双击打开的单 HTML，页面展示 CT 状态、逆流面板、功率总览、电网质量、能源 KPI、固定 8 微逆卡片，且无网络请求

#### Scenario: Missing values render as dash
- **WHEN** ViewModel 中某指标缺失
- **THEN** 界面文本显示 `—`，且 MUST NOT 出现 `undefined`、`null` 或 `NaN`

### Requirement: Offline multi-device bundle and ZIP
系统 MUST 支持导出多设备离线包：包含总览 `index.html`、各 CT 设备页、微逆详情页与本地静态资源（或每页自包含）；页面间 MUST 使用相对路径跳转；MUST 可打包为 ZIP；打开与跳转 MUST NOT 依赖 Next.js、SQLite 或互联网。

#### Scenario: Bundle navigation under file protocol
- **WHEN** 用户解压 ZIP 后以 `file:///` 打开 `bundle/index.html` 并进入某 CT 与微逆详情
- **THEN** 跳转成功且后退可用，全程无 HTTP/HTTPS 请求

### Requirement: Export data sources and CLI
系统 MUST 支持从现有 SQLite、Demo seed、Excel（经临时 SQLite 导入后导出并清理）三种输入导出；MUST 提供 `export:html`、`export:html:demo`、`export:html:excel` 脚本及 `--help`；非法参数 MUST 非零退出且 MUST NOT 留下半成品。

#### Scenario: Demo one-shot export
- **WHEN** 用户执行 `npm run demo:seed` 后执行 `npm run export:html:demo`
- **THEN** 至少生成三台 Demo 单文件示例、`bundle/index.html` 与 `anti-reverse-device-ui-demo.zip`

#### Scenario: Invalid CLI arguments
- **WHEN** 用户未提供 `--sn`/`--all` 或 Excel 路径缺失等非法组合
- **THEN** CLI 输出明确错误并以非零码退出，且不生成半成品目录内容

### Requirement: Reuse domain monitoring semantics
离线导出 MUST 通过共享 ViewModel 复用现有设备/遥测服务与 domain 规则（逆流判定、离线窗口、故障掩码解码、状态字典、图表 series），MUST NOT 另起一套业务语义。

#### Scenario: Reverse flow uses phase power rule
- **WHEN** A/B/C 任一相功率小于 0
- **THEN** 离线页判定为严重逆流告警并红色突出负值相，文案与在线页语义一致

#### Scenario: Fault mask decoding
- **WHEN** 故障掩码置位对应 PV 欠压等位
- **THEN** 界面展示完整中文故障名（含正确空格，如 `PV1 输入欠压`），值为 0 时显示“当前无故障”，缺失时显示 `—`，并保留十六进制原始码

### Requirement: Offline chart interactions
离线图表 MUST 支持 1/3/7 天切换、滚轮缩放、拖动、slider、tooltip、复位；功率图 MUST 支持图例选择单/双/三曲线；今日发电量跨日归零 MUST 断线；相位与微逆可点指标 MUST 打开离线弹窗曲线。

#### Scenario: Phase card opens history dialog
- **WHEN** 用户点击 A/B/C 相卡片
- **THEN** 打开离线弹窗展示该相最近窗口曲线，且包含负值标红与 0 W 基准线能力

#### Scenario: Today energy disconnects across day boundary
- **WHEN** 今日发电量序列跨自然日归零
- **THEN** 曲线在跨日处断开，MUST NOT 将前一日高点与次日零点错误连线

### Requirement: Offline acceptance evidence
仓库 MUST 提供自动化测试覆盖 ViewModel/CLI/产物/ZIP，以及 Playwright `file://` 用例；Playwright MUST 拦截全部 HTTP/HTTPS，一旦页面发起网络请求则失败；文档 MUST 说明导出与查看方式，并记录验收状态。

#### Scenario: Playwright offline network guard
- **WHEN** 运行离线 HTML Playwright 套件
- **THEN** 以 `file:///` 打开生成页，拦截网络；若出现 HTTP/HTTPS 请求则测试失败
