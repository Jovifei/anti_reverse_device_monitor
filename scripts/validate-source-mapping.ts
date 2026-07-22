import { validateSourceFieldMapping } from '@/src/adapters/source-db/field-mapping'
const result = validateSourceFieldMapping()
console.log(JSON.stringify({ ...result, mapping: result.mapping ? { sourceName: result.mapping.sourceName, timezone: result.mapping.timezone } : undefined }, null, 2))
if (!result.valid) process.exitCode = 1
