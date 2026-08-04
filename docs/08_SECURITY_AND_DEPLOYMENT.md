# 安全与部署规范

## 1. 数据库访问原则

优先级：

1. 公司平台官方 API；
2. 公司数据库只读副本；
3. 公司数据库专用只读视图；
4. 最后才是生产原始表只读访问。

禁止：

- 浏览器直连数据库；
- 前端保存数据库密码；
- 使用拥有 INSERT/UPDATE/DELETE/DROP 权限的源数据库账号；
- 在一期接入设备控制权限。

## 2. 环境变量

开发配置：

```env
APP_DATABASE_URL=file:./data/device-monitor.db
SOURCE_DB_ENABLED=false
DATA_RETENTION_DAYS=7
```

接入公司数据库时：

```env
SOURCE_DB_ENABLED=true
SOURCE_DATABASE_URL=...
SOURCE_DB_VIEW=...
```

规则：

- `.env.local` 加入 `.gitignore`；
- 仓库只提交 `.env.local.example`；
- 数据库密码不得以 `NEXT_PUBLIC_` 开头；
- 不在错误页面显示连接字符串；
- 日志对密码和 Token 脱敏。

## 3. 只读边界

一期、二期服务只能：

- SELECT；
- 调用只读 API；
- 订阅只读数据；
- 写入自己的 SQLite/PostgreSQL。

不得：

- 修改公司平台数据；
- 发布控制命令；
- 改变设备参数；
- 配对和解绑；
- OTA；
- 重启设备。

## 4. Docker 部署（当前）

本地日常仍可用 `start-monitor.ps1`。仓库已提供正式 Compose：

```text
docker-compose.yml
├── app          # Next.js Web（SQLite volume）
└── sync         # --profile sync；Mongo→SQLite 增量 Worker
```

推荐：`docker compose up --build -d` 后执行 `docker compose --profile sync up -d sync` 常驻同步。密钥放 `.env.docker`（自 `.env.docker.example`），勿写入镜像层。操作细节见 [11_OPS_RUNBOOK.md](./11_OPS_RUNBOOK.md)。

⚠️ Compose 在本仓库已验证文件齐全；是否在目标机跑通取决于本机是否安装 Docker。

三期目标（未实现）：PostgreSQL + Redis + Nginx / SSO。

## 5. 备份

### SQLite

- 定期复制数据库文件；
- 备份前执行一致性检查；
- 不在进程写入时直接粗暴复制；
- 保留最近若干个备份。

### PostgreSQL

- 每日备份；
- 定期恢复演练；
- 数据库迁移前完整备份；
- SQLite 切换 PostgreSQL 时保留只读回滚副本。

## 6. 日志

日志需要包含：

- 导入批次；
- 同步开始和结束；
- 新增记录数；
- 跳过重复数；
- 失败数；
- 清理记录数；
- 查询超时；
- 数据源断开；
- 告警计算错误。

日志不得包含：

- 数据库密码；
- 完整 Token；
- 未脱敏客户信息；
- 不必要的原始数据正文。

## 7. 正式上线前检查

- 数据源权限审计；
- API 输入校验；
- 依赖漏洞扫描；
- 数据库索引检查；
- 压力测试；
- 备份恢复演练；
- 告警规则复核；
- 浏览器兼容性测试；
- 安全负责人确认。
