# 数据模型与指标规范

## 1. 唯一指标键

正式数据不能只保存中文属性名称。

必须使用：

```text
device_sn + siid + piid + reported_at
```

微逆通道还应保存：

```text
inverter_index
inverter_sn
```

## 2. 推荐数据表

### 2.1 devices

| 字段 | 说明 |
|---|---|
| id | 内部主键 |
| device_sn | CT 设备 SN |
| product_model | 产品型号 |
| mac_address | MAC |
| software_version | CT 软件版本 |
| hardware_version | CT 硬件版本 |
| product_config | 产品配置 |
| sub1g_version | Sub1G 版本 |
| sub1g_address | Sub1G 地址 |
| last_reported_at | 最后上报时间 |
| platform_online | CT 本体是否在线 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

### 2.2 inverter_bindings

| 字段 | 说明 |
|---|---|
| id | 主键 |
| device_id | CT 设备 |
| inverter_index | 1～8 |
| inverter_sn | 微逆 SN |
| product_model | 微逆型号 |
| software_version | 软件版本 |
| hardware_version | 硬件版本 |
| sub1g_version | Sub1G 版本 |
| phase_num | 所在相 |
| connection_point | 配电箱或末端插座 |
| paired | 是否已配对 |
| updated_at | 更新时间 |

唯一索引：

```text
(device_id, inverter_index)
(device_id, inverter_sn)
```

### 2.3 metric_definitions

| 字段 | 说明 |
|---|---|
| metric_key | 系统内部名称 |
| siid | 服务 ID |
| piid | 属性 ID |
| identifier | 属性标识名 |
| display_name | 中文名称 |
| data_kind | timeseries/state/counter/fault/event/static |
| value_type | float/uint8/string/bool |
| unit | W/V/Hz/h/kWh/% |
| chart_group | power/grid/energy/inverter/communication |
| chart_enabled | 是否画曲线 |
| enum_json | 状态枚举 |
| warning_min/max | 一般告警 |
| critical_min/max | 严重告警 |
| retention_days | 保留天数 |

### 2.4 telemetry

| 字段 | 说明 |
|---|---|
| id | 主键 |
| device_id | CT 设备 |
| inverter_id | 可为空 |
| siid | SIID |
| piid | PIID |
| metric_key | 指标 |
| reported_at | 设备时间 |
| received_at | 平台接收时间 |
| value_number | 数值 |
| value_text | 字符串 |
| source_record_id | 源记录唯一 ID |

关键索引：

```text
(device_id, metric_key, reported_at DESC)
(inverter_id, metric_key, reported_at DESC)
(source_record_id UNIQUE)
```

### 2.5 device_latest

只保存每个设备和指标的最新值。

唯一键：

```text
(device_id, inverter_id, metric_key)
```

### 2.6 device_events

保存：

- CT 上线；
- CT 下线；
- 微逆在线；
- 微逆离线；
- 微逆未配对；
- 工作状态变化；
- 限流状态变化。

### 2.7 fault_events

| 字段 | 说明 |
|---|---|
| inverter_id | 微逆 |
| fault_mask | 原始 int32 |
| fault_hex | 十六进制 |
| active_faults_json | 故障名称数组 |
| event_type | appeared/changed/recovered |
| started_at | 开始 |
| ended_at | 恢复 |
| updated_at | 更新 |

### 2.8 reverse_flow_alerts

| 字段 | 说明 |
|---|---|
| device_id | CT 设备 |
| phase | A/B/C |
| started_at | 负功率开始 |
| ended_at | 恢复非负 |
| minimum_power_w | 最低功率 |
| sample_count | 负值样本数 |
| severity | critical |

### 2.9 sync_checkpoints

保存：

- 源数据库名称；
- 最后同步记录 ID；
- 最后同步时间；
- 最近成功时间；
- 最近错误；
- 当前同步状态。

## 3. 数据保留

默认：

```text
telemetry：7 天
device_latest：持续保留
device/inverter 元数据：持续保留
device_events：至少 7 天
fault_events：至少 7 天
sync_checkpoints：持续保留
```

清理任务必须可配置：

```env
DATA_RETENTION_DAYS=7
```

## 4. 数据归属问题

当前 Excel 暴露了以下问题：

1. `工作状态` 没有 SIID，无法稳定判断属于哪一台微逆；
2. Inv5、Inv6 的 `发电功率`、`pv1功率`、`pv2功率` 缺少前缀；
3. 部分温度字段名称可能使用错误模板；
4. 发电量的协议单位不一致；
5. 微逆 SN、版本、相位和接入点没有进入日志导出。

正式公司数据库视图必须返回：

```text
device_sn
siid
piid
inverter_index
reported_at
value
source_record_id
```

## 5. 防逆流规则

```text
active_power_ct1 < 0
OR active_power_ct2 < 0
OR active_power_ct3 < 0
→ 严重逆流告警
```

告警区间：

```text
首次负值
→ 持续负值
→ 下一次非负值
→ 告警恢复
```

## 6. 状态和故障字典

- `config/status_dictionary.json`
- `config/fault_dictionary.json`

代码必须从配置或领域模块读取，不应把中文故障名称散落在 React 组件中。
