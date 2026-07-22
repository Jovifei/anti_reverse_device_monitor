import fs from 'node:fs'
import path from 'node:path'
import { getSourceRuntimeConfig, loadLocalEnvironment } from '@/src/adapters/source-db/config'
import { validateSourceFieldMapping } from '@/src/adapters/source-db/field-mapping'
import { redactSourceError } from '@/src/adapters/source-db/security'
import { createConfiguredSourceAdapter } from '@/src/services/source-sync-service'
async function main() {
  loadLocalEnvironment(); const config = getSourceRuntimeConfig(); const mapping = validateSourceFieldMapping(); let health
  try { health = await createConfiguredSourceAdapter().healthCheck() } catch (error) { health = { healthy: false, source: config.sourceName, detail: redactSourceError(error).message, checkedAt: new Date() } }
  const report = `# Phase 2 source inspection report\n\n- Generated: ${new Date().toISOString()}\n- Source type: ${config.sourceType || 'not configured'}\n- Connection attempted: no (no concrete approved driver/view is configured)\n- Read-only permission: unverified\n- Health: ${health.healthy ? 'healthy' : 'blocked'}\n- Health detail: ${health.detail}\n- Mapping: ${mapping.valid ? `${mapping.mode} mapping valid` : `invalid: ${[...mapping.missing, ...mapping.errors].join('; ')}`}\n- Required telemetry fields: sourceRecordId, deviceSn, siid, piid, inverterIndex, reportedAt, receivedAt, value, valueType\n- Server version, accessible views, timestamp semantics, record estimate, recent data, duplicate rate and cursor support: pending approved read-only connection and local mapping.\n\nNo password, token, connection string or raw source rows were collected.\n`
  fs.writeFileSync(path.join(process.cwd(), 'docs', 'PHASE2_SOURCE_INSPECTION_REPORT.md'), report); console.log(JSON.stringify({ sourceType: config.sourceType || null, enabled: config.enabled, health: health.healthy ? 'healthy' : 'blocked', mappingValid: mapping.valid }, null, 2))
}
main().catch((error) => { console.error(JSON.stringify(redactSourceError(error))); process.exitCode = 1 })
