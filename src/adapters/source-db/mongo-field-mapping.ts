import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const fieldSchema = z.object({
  metricKey: z.string().min(1),
  siid: z.union([z.string(), z.number()]).transform(String),
  piid: z.union([z.string(), z.number()]).transform(String),
  inverterIndex: z.number().int().min(1).max(8).nullable().default(null)
})

const mappingSchema = z.object({
  version: z.literal(1),
  timezone: z.string().min(1).default('Asia/Shanghai'),
  fields: z.record(fieldSchema)
})

export type MongoFieldMapping = z.infer<typeof mappingSchema>
export type MongoFieldDefinition = z.infer<typeof fieldSchema>

export function resolveMongoFieldMappingPath(root = process.cwd()): { path: string; mode: 'local' | 'example' } {
  const configured = process.env.MONGO_FIELD_MAPPING_PATH?.trim()
  const localPath = path.join(root, configured || path.join('config', 'mongo-field-mapping.local.json'))
  if (fs.existsSync(localPath)) return { path: localPath, mode: 'local' }
  return { path: path.join(root, 'config', 'mongo-field-mapping.example.json'), mode: 'example' }
}

export function loadMongoFieldMapping(root = process.cwd()): { mapping: MongoFieldMapping; path: string; mode: 'local' | 'example' } {
  const target = resolveMongoFieldMappingPath(root)
  const raw = JSON.parse(fs.readFileSync(target.path, 'utf8'))
  const parsed = mappingSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`Invalid mongo field mapping at ${target.path}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`)
  }
  return { mapping: parsed.data, path: target.path, mode: target.mode }
}
