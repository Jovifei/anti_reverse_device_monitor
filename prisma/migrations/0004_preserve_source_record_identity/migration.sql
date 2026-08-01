PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Telemetry" (
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
  "sourceName" TEXT NOT NULL DEFAULT 'excel',
  CONSTRAINT "Telemetry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE,
  CONSTRAINT "Telemetry_inverterId_fkey" FOREIGN KEY ("inverterId") REFERENCES "InverterBinding"("id") ON DELETE SET NULL,
  CONSTRAINT "Telemetry_sourceRecordId_key" UNIQUE ("sourceRecordId")
);

INSERT INTO "new_Telemetry" ("id", "deviceId", "inverterId", "siid", "piid", "metricKey", "reportedAt", "receivedAt", "valueNumber", "valueText", "sourceRecordId", "sourceName")
SELECT "id", "deviceId", "inverterId", "siid", "piid", "metricKey", "reportedAt", "receivedAt", "valueNumber", "valueText", "sourceRecordId", "sourceName"
FROM "Telemetry";

DROP TABLE "Telemetry";
ALTER TABLE "new_Telemetry" RENAME TO "Telemetry";

CREATE INDEX "Telemetry_deviceId_metricKey_reportedAt_idx" ON "Telemetry"("deviceId", "metricKey", "reportedAt");
CREATE INDEX "Telemetry_inverterId_metricKey_reportedAt_idx" ON "Telemetry"("inverterId", "metricKey", "reportedAt");
CREATE INDEX "Telemetry_sourceName_reportedAt_idx" ON "Telemetry"("sourceName", "reportedAt");
CREATE INDEX "Telemetry_deviceId_inverterId_metricKey_reportedAt_sourceRecordId_idx" ON "Telemetry"("deviceId", "inverterId", "metricKey", "reportedAt", "sourceRecordId");

PRAGMA foreign_keys=ON;
