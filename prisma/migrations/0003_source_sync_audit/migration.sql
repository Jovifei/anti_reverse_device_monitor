ALTER TABLE "Telemetry" ADD COLUMN "sourceName" TEXT NOT NULL DEFAULT 'excel';
ALTER TABLE "SyncCheckpoint" ADD COLUMN "lastError" TEXT;
ALTER TABLE "SyncCheckpoint" ADD COLUMN "lastSuccessAt" DATETIME;
CREATE INDEX "Telemetry_sourceName_reportedAt_idx" ON "Telemetry"("sourceName", "reportedAt");
CREATE TABLE "SyncBatch" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "sourceName" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "cursorBefore" TEXT,
  "cursorAfter" TEXT,
  "imported" INTEGER NOT NULL DEFAULT 0,
  "duplicatesSkipped" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "unknownMetrics" INTEGER NOT NULL DEFAULT 0,
  "missingIdentifiers" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT
);
CREATE INDEX "SyncBatch_sourceName_startedAt_idx" ON "SyncBatch"("sourceName", "startedAt");
CREATE TABLE "SyncError" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "syncBatchId" INTEGER NOT NULL,
  "sourceRecordId" TEXT,
  "errorCode" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SyncError_syncBatchId_fkey" FOREIGN KEY ("syncBatchId") REFERENCES "SyncBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SyncError_syncBatchId_idx" ON "SyncError"("syncBatchId");
