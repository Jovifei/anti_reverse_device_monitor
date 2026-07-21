# Anti-Reverse Device Monitor (Phase-1 Scaffold)

This repository now contains a Next.js + TypeScript + Prisma + SQLite foundation for phase-1 delivery.

## Implemented now
- Project scaffolding for Next.js App Router
- Prisma schema for CT devices, inverter bindings, telemetry, latest values, events, alerts, import batches and checkpoints
- Initial SQLite migration (`prisma/migrations/0001_init`)
- Domain dictionaries integration (`status/fault/metric`)
- Source adapters (Fixture, Excel parser, Source DB placeholder)
- Repository + service layers
- API routes:
  - `GET /api/devices`
  - `GET /api/devices/[sn]`
  - `GET /api/devices/[sn]/latest`
  - `GET /api/devices/[sn]/history` (platform and inverter 7-day continuity + fault changes)
  - `GET /api/devices/[sn]/telemetry?metric=...`
  - `GET /api/devices/[sn]/health`
  - `GET /api/devices/[sn]/alarms`
  - `GET /api/devices/[sn]/inverters/[index]/latest`
  - `GET /api/devices/[sn]/inverters/[index]/telemetry?metric=...`
  - `POST /api/imports/excel`
- Basic pages:
  - `/` overview entry
  - `/devices`
  - `/devices/[sn]`
  - `/devices/[sn]/inverters/[index]`
- Scripts:
  - `scripts/import-excel.ts`
  - `scripts/cleanup-retention.ts`
  - `scripts/verify-data.ts`

## Runbook (phase-1)
1. Install dependencies
   - `npm install`
2. Initialize Prisma
   - `npx prisma generate`
3. Start dev server
   - `npm run dev`
4. Import Excel data
   - `npm run import:excel <excel_file> [sn]`
5. Run retention cleanup manually
  - `npm run cleanup`
6. Run data verify report
   - `npm run verify-data`

## Notes
- Browser never holds DB credentials.
- Source DB adapter is scaffolded as a read-only placeholder.
- This is phase-1 foundation; chart components and full ECharts rendering are still to be added in next step.
