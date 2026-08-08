import { describe, expect, it } from 'vitest'
import { renderMarkdown, summarizeIoTDevices, type AnalysisResult } from '@/scripts/analyze-iot-recency'
import type { IotDevice } from '@/src/adapters/iot-api/types'

const NOW = new Date('2026-08-08T10:00:00.000Z')
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function makeIot(over: Partial<IotDevice> & { id: string; sn: string }): IotDevice {
  return {
    productId: 'p1',
    nickname: `nick-${over.sn}`,
    online: false,
    ...over
  }
}

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

describe('summarizeIoTDevices', () => {
  it('splits mixed recency into A/B/C/D correctly', () => {
    const iot: IotDevice[] = [
      // A 桶：3 台从未上报（IoT 有，SQLite 无）
      makeIot({ id: 'd1', sn: 'SN-001' }),
      makeIot({ id: 'd2', sn: 'SN-002' }),
      makeIot({ id: 'd3', sn: 'SN-003' }),
      // B 桶：2 台近 7 日内上报（1 天前 / 6 天前）
      makeIot({ id: 'd4', sn: 'SN-004', online: true }),
      makeIot({ id: 'd5', sn: 'SN-005', online: true }),
      // C 桶：1 台曾活跃但 7+ 日离线（10 天前）
      makeIot({ id: 'd6', sn: 'SN-006' })
    ]
    const deviceBySn = new Map<string, { lastReportedAt: Date | null; platformOnline: boolean }>([
      ['SN-004', { lastReportedAt: new Date(daysAgoIso(1)), platformOnline: true }],
      ['SN-005', { lastReportedAt: new Date(daysAgoIso(6)), platformOnline: true }],
      ['SN-006', { lastReportedAt: new Date(daysAgoIso(10)), platformOnline: false }],
      // D 桶：SQLite 有但 IoT 全集没有
      ['SN-007', { lastReportedAt: new Date(daysAgoIso(2)), platformOnline: true }]
    ])

    const result = summarizeIoTDevices({ iotDevices: iot, deviceBySn, now: NOW })

    expect(result.bucketA.count).toBe(3)
    expect(result.bucketA.rows.map((r) => r.sn)).toEqual(['SN-001', 'SN-002', 'SN-003'])
    expect(result.bucketA.rows.every((r) => r.sqliteLastReportedAt === null)).toBe(true)

    expect(result.bucketB.count).toBe(2)
    // B 桶按 lastReportedAt 倒序：SN-004（1 天前）应在 SN-005（6 天前）之前
    expect(result.bucketB.rows.map((r) => r.sn)).toEqual(['SN-004', 'SN-005'])
    expect(result.bucketB.rows[0]?.daysSinceLastReport).toBeCloseTo(1.0, 1)
    expect(result.bucketB.rows[1]?.daysSinceLastReport).toBeCloseTo(6.0, 1)

    expect(result.bucketC.count).toBe(1)
    expect(result.bucketC.rows[0]?.sn).toBe('SN-006')
    expect(result.bucketC.rows[0]?.daysSinceLastReport).toBeCloseTo(10.0, 1)

    expect(result.bucketD.count).toBe(1)
    expect(result.bucketD.rows[0]?.sn).toBe('SN-007')
    expect(result.bucketD.rows[0]?.deviceId).toBeNull()
    expect(result.bucketD.rows[0]?.iotOnline).toBeNull()
  })

  it('treats lastReportedAt exactly at the 7-day boundary as bucket B', () => {
    const iot: IotDevice[] = [makeIot({ id: 'd-edge', sn: 'SN-EDGE' })]
    const justInside = new Date(NOW.getTime() - SEVEN_DAYS_MS + 1000) // 比 7 天少 1 秒
    const deviceBySn = new Map([['SN-EDGE', { lastReportedAt: justInside, platformOnline: true }]])
    const result = summarizeIoTDevices({ iotDevices: iot, deviceBySn, now: NOW })
    expect(result.bucketB.count).toBe(1)
    expect(result.bucketC.count).toBe(0)
  })

  it('returns all zeros when IoT is empty', () => {
    const deviceBySn = new Map<string, { lastReportedAt: Date | null; platformOnline: boolean }>([
      ['SN-100', { lastReportedAt: new Date(daysAgoIso(3)), platformOnline: true }]
    ])
    const result = summarizeIoTDevices({ iotDevices: [], deviceBySn, now: NOW })
    expect(result.bucketA.count).toBe(0)
    expect(result.bucketB.count).toBe(0)
    expect(result.bucketC.count).toBe(0)
    expect(result.bucketD.count).toBe(1) // SQLite 的 SN-100 落到 D 桶
    expect(result.bucketD.rows[0]?.sn).toBe('SN-100')
  })

  it('puts every IoT device into A when SQLite is empty', () => {
    const iot: IotDevice[] = [
      makeIot({ id: 'd1', sn: 'SN-A1' }),
      makeIot({ id: 'd2', sn: 'SN-A2', online: true }),
      makeIot({ id: 'd3', sn: 'SN-A3' })
    ]
    const result = summarizeIoTDevices({ iotDevices: iot, deviceBySn: new Map(), now: NOW })
    expect(result.bucketA.count).toBe(3)
    expect(result.bucketB.count).toBe(0)
    expect(result.bucketC.count).toBe(0)
    expect(result.bucketD.count).toBe(0)
    expect(result.bucketA.rows.map((r) => r.sn)).toEqual(['SN-A1', 'SN-A2', 'SN-A3'])
  })

  it('respects custom sevenDaysMs window', () => {
    const iot: IotDevice[] = [makeIot({ id: 'd1', sn: 'SN-3D' })]
    const deviceBySn = new Map([
      ['SN-3D', { lastReportedAt: new Date(daysAgoIso(3)), platformOnline: false }]
    ])
    // 14-day window：3 天前应落入 B 桶
    const result14 = summarizeIoTDevices({
      iotDevices: iot,
      deviceBySn,
      now: NOW,
      sevenDaysMs: 14 * 86_400_000
    })
    expect(result14.bucketB.count).toBe(1)
    // 1-day window：3 天前应落入 C 桶
    const result1 = summarizeIoTDevices({
      iotDevices: iot,
      deviceBySn,
      now: NOW,
      sevenDaysMs: 86_400_000
    })
    expect(result1.bucketC.count).toBe(1)
  })

  it('never includes null sn in IoT-matched buckets when SN missing', () => {
    const iot: IotDevice[] = [
      { id: 'd-no-sn', nickname: 'orphan' /* sn intentionally missing */ }
    ]
    const deviceBySn = new Map<string, { lastReportedAt: Date | null; platformOnline: boolean }>()
    const result = summarizeIoTDevices({ iotDevices: iot, deviceBySn, now: NOW })
    // 没 SN → 进 A 桶（IoT 有但 SQLite 无；最后比对时 IoT 端也补 null SN 记录）。
    expect(result.bucketA.count).toBe(1)
    expect(result.bucketA.rows[0]?.sn).toBeNull()
    expect(result.bucketA.rows[0]?.deviceId).toBe('d-no-sn')
  })
})

describe('renderMarkdown', () => {
  it('renders summary table with correct percentages and bucket titles', () => {
    const result: AnalysisResult = {
      generatedAt: NOW,
      productId: 'p-test',
      baseUrl: 'http://iot.iald.cn',
      totalRegistered: 4,
      bucketA: {
        count: 1,
        rows: [{ sn: 'SN-001', deviceId: 'd1', nickname: 'n1', iotOnline: false, sqliteLastReportedAt: null, daysSinceLastReport: null }]
      },
      bucketB: {
        count: 1,
        rows: [{ sn: 'SN-002', deviceId: 'd2', nickname: 'n2', iotOnline: true, sqliteLastReportedAt: daysAgoIso(1), daysSinceLastReport: 1 }]
      },
      bucketC: {
        count: 1,
        rows: [{ sn: 'SN-003', deviceId: 'd3', nickname: 'n3', iotOnline: false, sqliteLastReportedAt: daysAgoIso(10), daysSinceLastReport: 10 }]
      },
      bucketD: { count: 1, rows: [{ sn: 'SN-004', deviceId: null, nickname: null, iotOnline: null, sqliteLastReportedAt: daysAgoIso(2), daysSinceLastReport: 2 }] },
      iotPages: 3,
      warnings: ['第 1 页拉取失败：timeout'],
      durationMs: 1234
    }
    const md = renderMarkdown(result)
    expect(md).toContain('# IoT 设备 7 日活跃分析报告')
    expect(md).toContain('IoT base URL：http://iot.iald.cn')
    expect(md).toContain('产品 ID：p-test')
    expect(md).toContain('公司注册设备总数：4')
    expect(md).toMatch(/A\. 7\+ 日离线 · 从未上报[^\n]*\|\s*1\s*\|/)
    expect(md).toMatch(/B\. 近 7 日内上线[^\n]*\|\s*1\s*\|/)
    expect(md).toMatch(/C\. 7\+ 日离线 · 曾活跃[^\n]*\|\s*1\s*\|/)
    expect(md).toMatch(/D\. 仅 SQLite \/ IoT 未列出[^\n]*\|\s*1\s*\|/)
    expect(md).toContain('## A. 7+ 日离线 · 从未上报')
    expect(md).toContain('## B. 近 7 日内上线（需要关注）')
    expect(md).toContain('## C. 7+ 日离线 · 曾活跃（沉寂）')
    expect(md).toContain('## D. 反向警告')
    expect(md).toContain('翻页：3 页')
    expect(md).toContain('拉取/分析耗时：1234 ms')
    expect(md).toContain('第 1 页拉取失败：timeout')
  })

  it('handles empty buckets with placeholder text', () => {
    const result: AnalysisResult = {
      generatedAt: NOW,
      productId: 'p-empty',
      baseUrl: 'http://iot.iald.cn',
      totalRegistered: 0,
      bucketA: { count: 0, rows: [] },
      bucketB: { count: 0, rows: [] },
      bucketC: { count: 0, rows: [] },
      bucketD: { count: 0, rows: [] },
      iotPages: 0,
      warnings: [],
      durationMs: 100
    }
    const md = renderMarkdown(result)
    expect(md).toContain('公司注册设备总数：0')
    // 4 个桶均为空，应出现 4 次（空）占位
    const placeholders = md.match(/（空）/g) ?? []
    expect(placeholders.length).toBeGreaterThanOrEqual(4)
    expect(md).toContain('onWarning 数：0')
  })

  it('escapes pipes in cell content to keep markdown table well-formed', () => {
    const result: AnalysisResult = {
      generatedAt: NOW,
      productId: 'p',
      baseUrl: 'http://iot.iald.cn',
      totalRegistered: 1,
      bucketA: {
        count: 1,
        rows: [
          {
            sn: 'SN|PIPE',
            deviceId: 'd|x',
            nickname: 'has|pipe',
            iotOnline: false,
            sqliteLastReportedAt: null,
            daysSinceLastReport: null
          }
        ]
      },
      bucketB: { count: 0, rows: [] },
      bucketC: { count: 0, rows: [] },
      bucketD: { count: 0, rows: [] },
      iotPages: 1,
      warnings: [],
      durationMs: 50
    }
    const md = renderMarkdown(result)
    // '|' 必须转义为 '\|' 否则破坏表格。
    expect(md).toContain('SN\\|PIPE')
    expect(md).toContain('has\\|pipe')
  })
})