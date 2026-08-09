#!/usr/bin/env bash
set -Eeuo pipefail

# One-click local launcher:
# IoT getDevices -> config/devices.json -> Mongo telemetry -> SQLite -> worker + Web.

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

log() { printf '[start-monitor] %s\n' "$*"; }
fail() { printf '[start-monitor][ERROR] %s\n' "$*" >&2; exit 1; }

log 'checking local configuration and toolchain'
[[ -f .env.local ]] || fail 'missing .env.local; copy .env.local.example and fill the local password/token.'
command -v node >/dev/null 2>&1 || fail 'node not found; install Node.js 22 LTS.'
command -v npm >/dev/null 2>&1 || fail 'npm not found; install Node.js 22 LTS.'

if [[ ! -d node_modules ]]; then
  log 'node_modules missing; installing locked dependencies with npm ci'
  npm ci
fi

log '1/5 applying SQLite Prisma migrations'
node --env-file=.env.local scripts/ensure-db-migrations.mjs

log '2/5 syncing IoT registry: SN <-> device_id <-> nickname'
npm run devices:sync-iot

log '3/5 syncing registry devices from Mongo into local SQLite'
npm run source:sync

mkdir -p logs
worker_log="logs/source-worker-$(date +%Y-%m-%d).log"
log "4/5 starting source:worker; log=$worker_log"
npm run source:worker >>"$worker_log" 2>&1 &
worker_pid=$!

cleanup() {
  if kill -0 "$worker_pid" 2>/dev/null; then
    log "stopping source:worker pid=$worker_pid"
    kill "$worker_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

log '5/5 starting Next.js Web on http://127.0.0.1:3000/devices'
npm run dev -- --hostname 127.0.0.1 --port "${PORT:-3000}"
