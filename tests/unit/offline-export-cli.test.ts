import { describe, expect, it } from 'vitest'
import { parseExportArgs } from '@/src/export/offline/cli'
import { faultDisplayNames, toHexMask } from '@/src/domain/faults'

describe('offline export cli', () => {
  it('parses demo export flags', () => {
    const options = parseExportArgs(['--demo', '--all', '--bundle', '--single-file'])
    expect(options.demo).toBe(true)
    expect(options.all).toBe(true)
    expect(options.bundle).toBe(true)
    expect(options.singleFile).toBe(true)
  })

  it('rejects missing mode', () => {
    expect(() => parseExportArgs(['--sn', 'DEMO-CT-ONLINE-001'])).toThrow(/single-file|bundle/)
  })

  it('rejects missing sn/all', () => {
    expect(() => parseExportArgs(['--single-file'])).toThrow(/--sn|--all/)
  })
})

describe('offline fault display contract', () => {
  it('keeps spaced Chinese fault names', () => {
    const names = faultDisplayNames(0x00400c00)
    expect(names).toEqual(expect.arrayContaining(['PV1 输入欠压', 'PV2 输入欠压', 'PV 电压异常']))
    expect(toHexMask(0x00400c00)).toBe('0x00400C00')
  })

  it('shows no-fault and missing correctly', () => {
    expect(faultDisplayNames(0)).toEqual(['当前无故障'])
    expect(faultDisplayNames(null)).toBeNull()
  })
})
