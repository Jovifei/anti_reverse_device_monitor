## 1. 配置

- [x] 1.1 扩展 `.env.local.example`：Mongo URI/库名/集合/产品 ID 与 `SOURCE_DB_TYPE=mongodb`（密码仅占位）
- [x] 1.2 新增 `config/devices.example.json`；真实 `config/devices.json` 按需本地忽略
- [x] 1.3 新增 `config/mongo-field-mapping.example.json`，将 `data` 键映射到 metricKey/siid/piid

## 2. 适配器

- [x] 2.1 实现设备注册表加载与占位 SN 辅助函数
- [x] 2.2 实现 `MongoLogSourceAdapter`（健康检查、设备列表、按时间/设备/集合分片拉取遥测、展开 data.*）
- [x] 2.3 在 `createConfiguredSourceAdapter` 接入 `SOURCE_DB_TYPE=mongodb`
- [x] 2.4 确保适配器不对 Mongo 发起写命令

## 3. 脚本与界面

- [x] 3.1 新增 `devices:sync-registry`：合并近期出现的 device_id 到注册表草案
- [x] 3.2 按需扩展 sync CLI 过滤（`--device-id` / 产品 ID 走环境变量）
- [x] 3.3 界面回退：无正式 SN 时展示 device_id 或占位 SN

## 4. 测试与文档

- [x] 4.1 单元测试：字段展开、注册表解析、占位 SN（fixture，不连真库）
- [x] 4.2 只读用法与建议索引 `{ device_id: 1, time: -1 }` 说明文档（不含凭据）

## 5. Design 确认后剩余

- [x] 5.1 品类默认常量 `689adc659f04ec32f7642fbb`；`devices.example.json` 写入两台 SN↔device_id
- [x] 5.2 Dockerfile、compose（app + sync profile）、`.dockerignore`、部署说明
- [x] 5.3 品类默认与 Docker/联调相关单测或文档验收清单；交互 UI 仅 SN
