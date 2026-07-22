import { describe, expect, it } from 'vitest'
import { decodeFaultMask, toHexMask } from '@/src/domain/faults'

describe('fault decoding', () => {
  it('decodes 0x00400C00 into the documented PV faults', () => {
    expect(decodeFaultMask(0x00400c00).map((item) => item.name)).toEqual(['PV1输入欠压', 'PV2输入欠压', 'PV电压异常'])
    expect(toHexMask(0x00400c00)).toBe('0x00400C00')
  })
})
