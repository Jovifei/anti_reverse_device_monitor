import fs from 'node:fs'
import path from 'node:path'
import { read, utils, type WorkBook } from 'xlsx'
import type { NormalizedMetricRecord } from '@/src/adapters/source/types'
import { ReadOnlySourceAdapter } from '@/src/adapters/source/source-adapter'

type MappedMetric = { metricKey: string; siid: string; piid: string; inverterIndex?: number | null }

const CT_NAME_MAP: Record<string, MappedMetric> = {
  家庭负载功率: { metricKey: 'load_power', siid: '2', piid: '9' },
  电网功率: { metricKey: 'grid_power', siid: '2', piid: '10' },
  微逆发电总功率: { metricKey: 'inverter_total_power', siid: '2', piid: '11' },
  CT1相有功功率: { metricKey: 'active_power_ct1', siid: '2', piid: '12' },
  CT2相有功功率: { metricKey: 'active_power_ct2', siid: '2', piid: '13' },
  CT3相有功功率: { metricKey: 'active_power_ct3', siid: '2', piid: '14' },
  CT1相微逆当前功率: { metricKey: 'active_power_inv1', siid: '2', piid: '15' },
  CT2相微逆当前功率: { metricKey: 'active_power_inv2', siid: '2', piid: '16' },
  CT3相微逆当前功率: { metricKey: 'active_power_inv3', siid: '2', piid: '17' },
  电网电压: { metricKey: 'grid_voltage', siid: '2', piid: '18' },
  电网频率: { metricKey: 'grid_frequency', siid: '2', piid: '19' },
  CT_今日发电量: { metricKey: 'today_energy', siid: '2', piid: '20' },
  CT_总发电量: { metricKey: 'total_energy', siid: '2', piid: '21' },
  CT_今日发电时长: { metricKey: 'today_duration', siid: '2', piid: '22' },
  工作状态: { metricKey: 'state', siid: '2', piid: '1' }
}

const INV_FIELD_MAP: Record<string, string> = {
  发电功率: 'inverter_power',
  pv1功率: 'pv1_power',
  pv2功率: 'pv2_power',
  今日发电量: 'today_energy',
  累计发电量: 'total_energy',
  今日发电时长: 'today_duration',
  内部温度: 'internal_temperature',
  丢包率: 'packet_loss_rate',
  在线状态: 'online_state',
  故障参数: 'fault_param',
  工作状态: 'work_state'
}

function mapEventName(eventName: string): MappedMetric | null {
  const direct = CT_NAME_MAP[eventName]
  if (direct) return direct
  const invMatch = /^Inv(\d+)_(.+)$/.exec(eventName)
  if (!invMatch) return null
  const inverterIndex = Number(invMatch[1])
  const field = INV_FIELD_MAP[invMatch[2]]
  if (!field || !Number.isInteger(inverterIndex) || inverterIndex < 1 || inverterIndex > 8) return null
  return { metricKey: field, siid: '3', piid: String(inverterIndex), inverterIndex }
}

function parseReportedAt(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date
    const epoch = Date.UTC(1899, 11, 30)
    return new Date(epoch + value * 86400000)
  }
  if (typeof value === 'string' && value.trim()) {
    const normalized = value.trim().replace(/-/g, '/')
    const parsed = new Date(normalized)
    if (!Number.isNaN(parsed.getTime())) return parsed
    const asIso = new Date(value.trim().replace(' ', 'T') + '+08:00')
    if (!Number.isNaN(asIso.getTime())) return asIso
  }
  return null
}

function toNumber(value: unknown): number | string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value).trim()
  if (!text) return null
  const num = Number(text)
  return Number.isFinite(num) ? num : text
}

export function isDeviceLogExcel(filePath: string): boolean {
  const resolved = path.resolve(process.cwd(), filePath)
  const workbook = read(fs.readFileSync(resolved), { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return false
  const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: null, range: 0 })
  const first = rows[0]
  if (!first) return false
  return '事件名称' in first && '上报时间' in first && ('设备sn' in first || '设备SN' in first || '设备Sn' in first)
}

export class DeviceLogExcelAdapter extends ReadOnlySourceAdapter {
  constructor(private filePath: string) {
    super()
  }

  async read(): Promise<NormalizedMetricRecord[]> {
    const resolved = path.resolve(process.cwd(), this.filePath)
    const workbook: WorkBook = read(fs.readFileSync(resolved), { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!sheet) throw new Error('Excel 无工作表')
    const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: true, defval: null })
    const out: NormalizedMetricRecord[] = []

    rows.forEach((row, idx) => {
      const eventType = String(row['事件类型'] ?? '')
      const eventName = String(row['事件名称'] ?? '').trim()
      const deviceSn = String(row['设备sn'] ?? row['设备SN'] ?? row['设备Sn'] ?? '').trim()
      const reportedAt = parseReportedAt(row['上报时间'])
      if (!deviceSn || !reportedAt || !eventName) return

      if (eventName === '上线' || eventName === '下线') {
        // platform connectivity is derived from telemetry timestamps; skip raw online events
        return
      }
      if (eventType && eventType !== '数据上报' && !eventName.startsWith('Inv')) {
        // keep 数据上报 and inverter metrics
      }

      const mapped = mapEventName(eventName)
      if (!mapped) return
      const value = toNumber(row['事件内容'])
      out.push({
        deviceSn,
        siid: mapped.siid,
        piid: mapped.piid,
        inverterIndex: mapped.inverterIndex ?? null,
        inverterSn: null,
        reportedAt,
        metricKey: mapped.metricKey,
        value,
        valueText: typeof value === 'string' ? value : null,
        sourceRecordId: `${path.basename(resolved)}:${idx}:${eventName}:${reportedAt.toISOString()}`
      })
    })

    return out
  }
}
