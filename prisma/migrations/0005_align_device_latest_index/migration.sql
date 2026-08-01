PRAGMA foreign_keys=OFF;

CREATE TABLE "new_DeviceLatest" (
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
  CONSTRAINT "DeviceLatest_deviceId_inverterId_metricKey_key" UNIQUE ("deviceId", "inverterId", "metricKey")
);

INSERT INTO "new_DeviceLatest" ("id", "deviceId", "inverterId", "metricKey", "valueNumber", "valueText", "reportedAt", "receivedAt")
SELECT "id", "deviceId", "inverterId", "metricKey", "valueNumber", "valueText", "reportedAt", "receivedAt"
FROM "DeviceLatest";

DROP TABLE "DeviceLatest";
ALTER TABLE "new_DeviceLatest" RENAME TO "DeviceLatest";
CREATE INDEX "DeviceLatest_deviceId_metricKey_idx2" ON "DeviceLatest"("deviceId", "metricKey");

PRAGMA foreign_keys=ON;
