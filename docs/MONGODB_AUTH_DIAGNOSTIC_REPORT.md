# MongoDB authentication diagnostic report

MONGODB_AUTH_DIAGNOSTIC_STATUS: PARTIAL

## 脱敏连接参数

- Host: proxy.ze***.cn
- Port: 3718
- authSource: zeico_cloud
- Configured database: log
- Username read correctly: yes (ze***go)
- Password output: prohibited
- Password URL encoding: preserved from local URI

## Transport

- TCP reachable: yes
- MongoDB handshake: reached authentication stage

## URI and authentication matrix

| Form | Mechanism | directConnection | Handshake | Result | Mongo error code | Error class |
|---|---|---:|---|---|---|---|
| A | SCRAM-SHA-256 | false | not confirmed | failed | — | MongoServerSelectionError |
| A | SCRAM-SHA-1 | false | not confirmed | failed | — | MongoServerSelectionError |
| B | SCRAM-SHA-256 | false | not confirmed | failed | — | MongoServerSelectionError |
| B | SCRAM-SHA-1 | false | not confirmed | failed | — | MongoServerSelectionError |
| C | SCRAM-SHA-256 | true | reached authentication | failed | 18 | MongoServerError |
| C | SCRAM-SHA-1 | true | reached authentication | success | — | — |
| D | SCRAM-SHA-256 | true | reached authentication | failed | 18 | MongoServerError |
| D | SCRAM-SHA-1 | true | reached authentication | success | — | — |

## Possible causes (ordered)

1. 凭据、authSource、认证机制或数据库 read 权限不匹配。MongoDB 已到达认证阶段。
2. directConnection 是否必需仍待由数据库管理员确认。
3. 需由数据库管理员确认账号名称、密码、authSource、SCRAM 机制、log 库 read 角色和出口 IP 白名单。

## 成功后的允许元数据

认证已成功，但允许的元数据调用失败：authentication-or-authorization-failure（code=13，class=MongoServerError）。未读取业务文档。

## Safety

- No insert, update, delete, drop, index change, shard change, MQTT, device-control, OTA, business-data read, or field inference was performed.
- This report excludes the password, full URI, Token, raw logs, and device identifiers.

## Authentication follow-up: individual permitted metadata operations

- Selected successful connection: direct connection with `SCRAM-SHA-1`.
- `db.getName()` equivalent: succeeded and resolved the configured `log` database.
- `db.stats()` equivalent (`dbStats` command): failed with MongoDB error code `13` (`MongoServerError`).
- `db.listCollections()`: failed with MongoDB error code `13` (`MongoServerError`).

Conclusion: the account credentials are valid for `SCRAM-SHA-1` through the direct proxy connection, but the authenticated principal is not authorized to read metadata from the `log` database. No collection names or business documents were returned. The database administrator must grant the approved read-only role on `log` (including metadata access required for `listCollections` and `dbStats`) before any source-structure inspection can continue.
