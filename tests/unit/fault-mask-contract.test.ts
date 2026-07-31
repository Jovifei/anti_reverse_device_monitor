import { describe, expect, it } from 'vitest';

import { decodeFaultMask, faultDisplayNames, toHexMask } from '@/src/domain/faults';

describe('fault mask display contract', () => {
  it('decodes 0x00400C00 into the documented Chinese fault names', () => {
    expect(faultDisplayNames(0x00400c00)).toEqual(['PV1 输入欠压', 'PV2 输入欠压', 'PV 电压异常']);
    expect(toHexMask(0x00400c00)).toBe('0x00400C00');
  });

  it('does not invent a fault when the source mask is zero or missing', () => {
    expect(decodeFaultMask(0)).toEqual([]);
    expect(faultDisplayNames(0)).toEqual(['当前无故障']);
    expect(faultDisplayNames(null)).toBeNull();
  });
});
