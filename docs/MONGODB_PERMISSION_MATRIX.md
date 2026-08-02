# MongoDB permission matrix

MONGODB_SOURCE_ACCESS_STATUS: PERMISSION_BLOCKED

## Redacted connection parameters

- Host: proxy.ze***.cn
- Port: 3718
- Database: log
- authSource: zeico_cloud
- authMechanism: SCRAM-SHA-1
- directConnection: true
- Username loaded: yes
- Password output: prohibited

## Permission matrix

| Command | Result | MongoDB error code | Error type |
|---|---|---|---|
| ping | PASS | — | — |
| authentication | PASS | — | — |
| connectionStatus | PASS | — | — |
| dbStats | FAIL | 13 | MongoServerError |
| listCollections | FAIL | 13 | MongoServerError |
| find | NOT_TESTED | — | — |
| countDocuments | NOT_TESTED | — | — |
| listIndexes | NOT_TESTED | — | — |

## Collection scope

- Administrator-confirmed local collection: not configured

## Required administrator action

1. Grant the authenticated account the approved read role on `log`, including `listCollections`, `dbStats`, and `find`; or
2. Provide `MONGODB_COLLECTION` locally with an administrator-confirmed collection name and collection-level `find` permission.

No write command, business-data field inference outside an authorized collection, password, full URI, Token, raw document, or device identifier was written to this report.
