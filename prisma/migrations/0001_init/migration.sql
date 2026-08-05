BEGIN;

CREATE TABLE "Device" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "deviceSn" TEXT NOT NULL,
  "productModel" TEXT,
  "macAddress" TEXT,
  "softwareVersion" TEXT,
  "hardwareVersion" TEXT,
  "productConfig" TEXT,
  "sub1gVersion" TEXT,
  "sub1gAddress" TEXT,
  "lastReportedAt" DATETIME,
  "platformOnline" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Device_deviceSn_key" ON "Device"("deviceSn");

CREATE TABLE "InverterBinding" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "deviceId" INTEGER NOT NULL,
  "inverterIndex" INTEGER NOT NULL,
  "inverterSn" TEXT,
  "productModel" TEXT,
  "softwareVersion" TEXT,
  "hardwareVersion" TEXT,
  "sub1gVersion" TEXT,
  "connectionPoint" TEXT,
  "paired" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "InverterBinding_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE,
  CONSTRAINT "InverterBinding_deviceId_inverterIndex_key" UNIQUE ("deviceId", "inverterIndex"),
  CONSTRAINT "InverterBinding_deviceId_inverterSn_key" UNIQUE ("deviceId", "inverterSn")
);

CREATE TABLE "MetricDefinition" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "metricKey" TEXT NOT NULL,
  "siid" TEXT NOT NULL,
  "piid" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "dataKind" TEXT NOT NULL,
  "valueType" TEXT NOT NULL,
  "unit" TEXT,
  "chartGroup" TEXT,
  "chartEnabled" BOOLEAN NOT NULL DEFAULT true,
  "enumSource" TEXT,
  "enumJson" JSON,
  "warningMin" REAL,
  "warningMax" REAL,
  "criticalMin" REAL,
  "criticalMax" REAL,
  "retentionDays" INTEGER
);
CREATE UNIQUE INDEX "MetricDefinition_metricKey_key" ON "MetricDefinition"("metricKey");

CREATE TABLE "Telemetry" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "deviceId" INTEGER NOT NULL,
  "inverterId" INTEGER,
  "siid" TEXT NOT NULL,
  "piid" TEXT NOT NULL,
  "metricKey" TEXT NOT NULL,
  "reportedAt" DATETIME NOT NULL,
  "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valueNumber" REAL,
  "valueText" TEXT,
  "sourceRecordId" TEXT NOT NULL,
  CONSTRAINT "Telemetry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE,
  CONSTRAINT "Telemetry_inverterId_fkey" FOREIGN KEY ("inverterId") REFERENCES "InverterBinding"("id") ON DELETE SET NULL,
  CONSTRAINT "Telemetry_sourceRecordId_key" UNIQUE ("sourceRecordId"),
  CONSTRAINT "Telemetry_deviceId_inverterId_metricKey_reportedAt_key" UNIQUE ("deviceId", "inverterId", "metricKey", "reportedAt")
);
CREATE INDEX "Telemetry_deviceId_metricKey_reportedAt_idx" ON "Telemetry"("deviceId", "metricKey", "reportedAt");
CREATE INDEX "Telemetry_inverterId_metricKey_reportedAt_idx" ON "Telemetry"("inverterId", "metricKey", "reportedAt");

CREATE TABLE "DeviceLatest" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "deviceId" INTEGER NOT NULL,
  "inverterId" INTEGER,
  "metricKey" TEXT NOT NULL,
  "valueNumber" REAL,
  "valueText" TEXT,
  "reportedAt" DATETIME NOT NULL,
  "receivedAt" DATETIME NOT NULL,
  CONSTRAINT "DeviceLatest_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE,
  CONSTRAINT "DeviceLatest_inverterId_fkey" FOREIGN KEY ("inverterId") REFERENCES "InverterBinding"("id") ON DELETE SET NULL,
  CONSTRAINT "DeviceLatest_deviceId_inverterId_metricKey_key" UNIQUE ("deviceId", "inverterId", "metricKey"),
  CONSTRAINT "DeviceLatest_deviceId_metricKey_idx" UNIQUE ("deviceId", "metricKey")
);
CREATE INDEX "DeviceLatest_deviceId_metricKey_idx2" ON "DeviceLatest"("deviceId", "metricKey");

CREATE TABLE "DeviceEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "deviceId" INTEGER NOT NULL,
  "inverterId" INTEGER,
  "eventType" TEXT NOT NULL,
  "fromState" TEXT,
  "toState" TEXT,
  "happenedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeviceEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE,
  CONSTRAINT "DeviceEvent_inverterId_fkey" FOREIGN KEY ("inverterId") REFERENCES "InverterBinding"("id") ON DELETE SET NULL
);
CREATE INDEX "DeviceEvent_deviceId_happenedAt_idx" ON "DeviceEvent"("deviceId", "happenedAt");

CREATE TABLE "FaultEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "inverterId" INTEGER NOT NULL,
  "faultMask" INTEGER NOT NULL,
  "faultHex" TEXT NOT NULL,
  "activeFaultsJson" JSON NOT NULL,
  "eventType" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL,
  "endedAt" DATETIME,
  "updatedAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FaultEvent_inverterId_fkey" FOREIGN KEY ("inverterId") REFERENCES "InverterBinding"("id") ON DELETE CASCADE
);
CREATE INDEX "FaultEvent_inverterId_startedAt_idx" ON "FaultEvent"("inverterId", "startedAt");

CREATE TABLE "ReverseFlowAlert" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "deviceId" INTEGER NOT NULL,
  "phase" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL,
  "endedAt" DATETIME,
  "minimumPowerW" REAL NOT NULL,
  "sampleCount" INTEGER NOT NULL DEFAULT 0,
  "severity" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReverseFlowAlert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE
);
CREATE INDEX "ReverseFlowAlert_deviceId_phase_startedAt_idx" ON "ReverseFlowAlert"("deviceId", "phase", "startedAt");

CREATE TABLE "ImportBatch" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "source" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordCount" INTEGER NOT NULL DEFAULT 0,
  "checksum" TEXT,
  "status" TEXT NOT NULL DEFAULT 'running'
);

CREATE TABLE "SyncCheckpoint" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "sourceName" TEXT NOT NULL,
  "sourceCursor" TEXT NOT NULL,
  "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'ok',
  CONSTRAINT "SyncCheckpoint_sourceName_key" UNIQUE ("sourceName")
);

PRAGMA foreign_keys=ON;
COMMIT;
