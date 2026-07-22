import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const requiredFields = ['sourceRecordId', 'deviceSn', 'siid', 'piid', 'inverterIndex', 'reportedAt', 'receivedAt', 'value', 'valueType'] as const
const mappingSchema = z.object({ version: z.literal(1), sourceName: z.string().min(1), timezone: z.string().min(1), telemetry: z.record(z.string().min(1)).refine((value) => requiredFields.every((field) => Boolean(value[field])), { message: `telemetry mapping must contain ${requiredFields.join(', ')}` }), properties: z.object({ device: z.record(z.string()).default({}), inverter: z.record(z.string()).default({}) }).default({ device: {}, inverter: {} }) })
export type SourceFieldMapping = z.infer<typeof mappingSchema>
export type MappingValidationResult = { valid: boolean; path: string; mode: 'local' | 'example'; missing: string[]; errors: string[]; mapping?: SourceFieldMapping }
export function resolveMappingPath(root = process.cwd()) { const localPath = path.join(root, 'config', 'source-field-mapping.local.json'); return fs.existsSync(localPath) ? { path: localPath, mode: 'local' as const } : { path: path.join(root, 'config', 'source-field-mapping.example.json'), mode: 'example' as const } }
export function validateSourceFieldMapping(root = process.cwd()): MappingValidationResult {
  const target = resolveMappingPath(root)
  try {
    const raw = JSON.parse(fs.readFileSync(target.path, 'utf8'))
    const parsed = mappingSchema.safeParse(raw)
    if (parsed.success) return { valid: true, path: target.path, mode: target.mode, missing: [], errors: [], mapping: parsed.data }
    const text = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
    const telemetry = raw && typeof raw === 'object' && raw.telemetry && typeof raw.telemetry === 'object' ? raw.telemetry as Record<string, unknown> : {}
    return { valid: false, path: target.path, mode: target.mode, missing: requiredFields.filter((field) => !telemetry[field]), errors: text }
  } catch (error) { return { valid: false, path: target.path, mode: target.mode, missing: [...requiredFields], errors: [error instanceof Error ? error.message : String(error)] } }
}
export function loadSourceFieldMapping(root = process.cwd()) { const result = validateSourceFieldMapping(root); if (!result.valid || !result.mapping) throw new Error(`Invalid source field mapping: ${[...result.missing, ...result.errors].join('; ')}`); return result.mapping }
