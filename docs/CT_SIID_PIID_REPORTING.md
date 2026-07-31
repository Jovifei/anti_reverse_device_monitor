# CT 防逆流设备 SIID / PIID 对照表

> 依据固件仓库 `ess-smart-ct-v2`：`app/src/wifi.c`、`app/inc/wifi.h`、`app/inc/main.h`  
> 产品：`PRODUCT_ID = 689adc659f04ec32f7642fbb`（型号 `GC-CTST3C`）  
> 整理日期：2026-07-31  
> 用途：Mongo `device_log_*` 字段展开、监控 KPI 映射、区分「日志可查」与「需 IoT 运行参数」

## 怎么看数据

| 查看方式 | 适用 | 说明 |
|----------|------|------|
| Mongo `device_log_<productId>` → `npm run source:sync` → 本地 Prisma / `/devices` | **主动上报** 的属性 | 固件发 `properties_changed`，日志里通常有 `data.<siid>_<piid>` 时间序列 |
| IoT 平台「运行参数 / 属性」面板，或下发 `get_properties` | **不主动上报** 的属性 | 固件仅在被查询时应答，一般**没有**变更日志时间序列 |
| Excel `docs/data/设备日志_<SN>_*.xlsx` | 历史导出快照 | 事件名可能与固件 siid/piid **不一致**；以本文固件表为准 |

日志字段键格式：`data.<siid>_<piid>`，例如 `data.2_10` = SIID 2 / PIID 10（电网总功率）。

监控侧映射配置：`config/mongo-field-mapping.example.json`（可覆盖为 `mongo-field-mapping.local.json`）。

上报节奏（CT SIID 2/3）：约 **5 分钟**轮流一整包；状态 / 三相 CT 功率另有事件触发上报。微逆按变化立刻 / 定时 / 设置变化分批上报。

---

## 一、会主动上报（可从 Mongo 日志 / 同步库查）

### 1.1 SIID 2 — CT 运行与功率

| siid_piid | 含义 | 上报方式 | 监控 metricKey（示例） | 怎么查 |
|-----------|------|----------|------------------------|--------|
| `2_1` | 系统运行状态 | 定时整包 + 事件 | `state` | sync 后详情「运行状态」/ 遥测表 |
| `2_2` | CT1 相有功（\|P\|&lt;10 报 0） | 定时 + 事件 | `active_power_ct1` | 详情 A 相 / 功率曲线 |
| `2_3` | CT2 相有功 | 定时 + 事件 | `active_power_ct2` | 详情 B 相 |
| `2_4` | CT3 相有功 | 定时 + 事件 | `active_power_ct3` | 详情 C 相 |
| `2_5` | CT1 微逆功率 | 定时 | `active_power_inv1` | 功率曲线高级项 |
| `2_6` | CT2 微逆功率 | 定时 | `active_power_inv2` | 同上 |
| `2_7` | CT3 微逆功率 | 定时 | `active_power_inv3` | 同上 |
| `2_8` | 微逆总功率 | 定时 | `inverter_total_power` | 详情「微逆发电总功率」 |
| `2_9` | 家庭负载总功率（use） | 定时 | `load_power` | 详情「当前家庭负载功率」 |
| `2_10` | 电网总功率（正买负卖） | 定时 | `grid_power` | 详情「当前电网功率」 |
| `2_11` | 今日发电时长 | 定时 | `today_duration` | 详情 KPI |
| `2_12` | 今日发电量 | 定时 | `today_energy` | 详情 KPI |
| `2_13` | 累计发电量 | 定时 | `total_energy` | 详情 KPI |
| `2_14` | 限流状态 | 定时 | `limit_state` | 遥测 / 字典解析 |
| `2_15` | 相序识别 `sequence_k` | 定时 | `phase_sequence` | 遥测 |
| `2_16` | 电网电压 | 定时 | `grid_voltage` | 电网曲线 |
| `2_17` | 电网频率 | 定时 | `grid_frequency` | 电网曲线 |
| `2_21` | Sub1G 状态 | IoT（部分环境日志偶发） | `sub1g_state` | 版本与通信 |
| `2_26` | WiFi 信号强度 | 事件/部分上报（非定时整包保证） | `wifi_signal_strength` | 版本与通信 / 首页 |

代码入口：`report_ct_siid2_properties()`；事件位：`PROP_RUN_STATE` / `PROP_A/B/C_PHASE_POWER`。

### 1.2 SIID 3 — CT 策略与配对

| siid_piid | 含义 | 上报时机 | 监控 metricKey（示例） | 怎么查 |
|-----------|------|----------|------------------------|--------|
| `3_3` | 配对列表 | 定时 | （字符串，常不进 KPI） | Mongo `data.3_3` |
| `3_5` | 绑定 SN | 事件 | — | Mongo 事件日志 |
| `3_6` | 解绑 SN | 事件 | — | Mongo 事件日志 |
| `3_10` | 功率工作模式 | 定时 | `work_mode` | 详情「工作模式」 |
| `3_11` | 限功率值 | 定时 | `to_grid_power_limit` | Mongo / 遥测 |
| `3_15` | CT Sub1G 信道 | 定时 | `sub1g_channel` | Mongo / 遥测 |

代码入口：`report_ct_siid3_properties()`；绑定/解绑为单独 `properties_changed 3 5|6`。

### 1.3 微逆 SIID 4–11（有配对才报）

微逆通道索引：`inverter_index = siid - 3`（SIID 4 → 通道 1 … SIID 11 → 通道 8）。  
PIID 定义见 `main.h` 中 `INV_PIID_*`。

| piid | 含义 | 上报时机 | 怎么查 |
|------|------|----------|--------|
| `1` | 在线状态（0 未配对 / 1 配对离线 / 2 在线） | 变化立刻 | 微逆卡片在线徽章 |
| `5` | 产品型号 | 设置变化 | 微逆详情 / 绑定表 |
| `6` | 工作状态 | 变化立刻 | 微逆「工作状态」 |
| `7` | 发电功率 | 定时 | 微逆总功率 |
| `8` | 今日发电量 | 定时 | 微逆 KPI |
| `9` | 累计发电量 | 定时 | 微逆 KPI |
| `10` | 防逆流开关 | 变化立刻 | 微逆开关 |
| `11` | 发电开关 | 变化立刻 | 微逆开关 |
| `12` | 今日发电时长 | 定时 | 微逆 KPI |
| `13` | 故障参数 | 变化立刻 | 故障列表 |
| `14` | 内部温度 | 定时 | 温度历史 |
| `22` | 所在相位 | 变化立刻 | 卡片相位标签 |
| `24` | 发电功率限制 | 设置变化 | 微逆设置 |
| `25` | 接入点 | 设置变化 | 微逆设置 |
| `26`–`29` | PV1–4 功率 | 定时 | PV 曲线 |
| `35` | Sub1G 信道 | 设置变化 | 微逆设置 |
| `36` | 0x51 原始 hex（调试） | 事件 | 一般勿当业务 KPI |
| `37` | 丢包率 | 定时 | 丢包率历史 |

代码入口：`report_inverter_properties` / `report_inverter_properties_scheduled` / `report_inverter_set_param`。

---

## 二、固件不主动上报（请去 IoT 运行参数查）

下列属性在 `get_properties` 可应答，但**不会**进入定时/事件 `properties_changed`，Mongo 变更日志通常**没有时间序列**。联调时在 IoT 控制台查当前值，或对设备下发读属性。

### 2.1 SIID 1 — 设备信息（全部）

| siid_piid | 含义 | 怎么查 |
|-----------|------|--------|
| `1_1` | 产品型号 | IoT 运行参数 |
| `1_2` | SN（无效时用 MAC） | IoT / 设备注册 |
| `1_3` | MAC | IoT 运行参数 |
| `1_4` | 软件版本（MCU） | IoT；监控页「软件版本号」若为空即因未上报 |
| `1_5` | 硬件版本 | IoT 运行参数 |
| `1_6` | 恢复 WiFi 相关 | IoT（可写） |
| `1_8` | SubG 软件版本 | IoT；监控「SubG 版本号」 |
| `1_9` | CT Sub1G 地址 | IoT 运行参数 |

### 2.2 SIID 2 — 仅可读、不上报

| siid_piid | 含义 | 怎么查 |
|-----------|------|--------|
| `2_18` | CT1 Sub1G 广播平均功率 | IoT `get_properties` |
| `2_19` | CT2 Sub1G 广播平均功率 | IoT |
| `2_20` | CT3 Sub1G 广播平均功率 | IoT |
| `2_21` | Sub1G 状态 | IoT；监控「Sub1G 状态」缺省时用此项 |

### 2.3 SIID 3 — 可读/可写，但不在定时上报包

| siid_piid | 含义 | 怎么查 |
|-----------|------|--------|
| `3_2` | 相序识别进行中 | IoT |
| `3_4` | INV 请求配对列表 | IoT |
| `3_7` | 用户配对列表 | IoT |
| `3_8` | 三相模式开关 | IoT（可写） |
| `3_12` | FFT 识别功率阈值 | IoT（可写） |
| `3_13` | FFT 识别间隔 | IoT（可写） |

### 2.4 微逆 SIID 4–11 — 可读但不主动 `properties_changed`

| piid | 含义 | 怎么查 |
|------|------|--------|
| `2` | 设备 SN | IoT / 配对流程；绑定表可能另有来源 |
| `3` | 软件版本 | IoT（`report_inverter_set_param` 中上报已注释） |
| `4` | Sub1G 版本 | IoT（同上，已注释） |
| `16`–`19` | PV1/2 电压、电流 | IoT |
| `20` / `21` | 微逆侧电网电压 / 频率 | IoT |
| `32` | FFT 开关（偏下发） | IoT |
| `33` | PV 路数 | IoT |
| `34` | Sub1G 地址 | IoT |

---

## 三、与旧 Excel / 错误映射的差异（必读）

| 固件真相 | 错误旧映射（勿再使用） |
|----------|------------------------|
| `2_2` / `2_3` / `2_4` = CT1/2/3 相有功 | 曾误把 `2_4` 等映射成「软件版本 / 总功率」等 Studio 字段 |
| `2_8` = 微逆总功率 | — |
| `2_9` = 家庭负载 | Excel 事件名体系曾用另一套 piid（如把负载标到别的键） |
| `2_10` = 电网功率 | 勿与 Studio 逆变器投影的 `2_15=grid` 混用 |
| `2_12` = 今日发电量 | 勿当成 CT1 有功 |

监控页常见空白项对应关系：

| UI 文案 | siid_piid | 能否从日志出 |
|---------|-----------|--------------|
| 软件版本号 | `1_4` | 否 → IoT |
| SubG 版本号 | `1_8` | 否 → IoT |
| Sub1G 状态 | `2_21` | 否 → IoT |
| 工作模式 | `3_10` | 是 → 同步后应有 |

---

## 四、相关文件

| 路径 | 作用 |
|------|------|
| `ess-smart-ct-v2/app/src/wifi.c` | 上报与 get/set 实现 |
| `ess-smart-ct-v2/app/inc/main.h` | `INV_PIID_*`、SIID 4–11 |
| `config/mongo-field-mapping.example.json` | 本仓库 Mongo → metricKey |
| `docs/MONGODB_READONLY_SOURCE.md` | 同步与部署说明 |
| `docs/data/设备日志_*.xlsx` | 原始 Excel；详情页「原始数据」下载 |

---

## 五、维护说明

固件改动 `report_ct_siid*` / `report_inverter_*` / get_properties 分支时，请同步更新本文表格与 `mongo-field-mapping.example.json`。  
新增「可从库查」字段后，再决定是否扩展监控 KPI / 曲线别名（`src/domain/monitoring.ts`）。
