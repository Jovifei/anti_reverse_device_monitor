import { describe, expect, it } from 'vitest'
import { decodeFaultMask, faultDisplayNames, toHexMask } from '@/src/domain/faults'

describe('fault decoding', () => {
  it('decodes 0x00400C00 into the documented PV faults', () => {
    expect(decodeFaultMask(0x00400c00).map((item) => item.name)).toEqual(['PV1 输入欠压', 'PV2 输入欠压', 'PV 电压异常'])
    expect(toHexMask(0x00400c00)).toBe('0x00400C00')
  })

  it('keeps multi-bit fault names in dictionary order', () => {
    expect(faultDisplayNames((1 << 0) | (1 << 23))).toEqual(['电网1级过压', '过热'])
  })

  it('distinguishes an explicit clear mask from missing telemetry', () => {
    expect(faultDisplayNames(0)).toEqual(['当前无故障'])
    expect(faultDisplayNames(null)).toBeNull()
  })
})
