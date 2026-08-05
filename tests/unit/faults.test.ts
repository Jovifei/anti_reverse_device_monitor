import { describe, expect, it } from 'vitest'
import {
  decodeFaultMask,
  faultDisplayNames,
  faultNameClassName,
  formatCurrentFaultLabel,
  hadRecentReportableInverterFault,
  hasReportableInverterFault,
  isReportableInverterFaultName,
  toHexMask
} from '@/src/domain/faults'

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

describe('hasReportableInverterFault', () => {
  it('ignores PV1/PV2 undervoltage and PV voltage abnormal alone', () => {
    expect(hasReportableInverterFault(0x00400c00)).toBe(false)
    expect(hasReportableInverterFault(1 << 10)).toBe(false)
    expect(hasReportableInverterFault(1 << 11)).toBe(false)
    expect(hasReportableInverterFault(1 << 22)).toBe(false)
  })

  it('treats any other active fault bit as reportable', () => {
    expect(hasReportableInverterFault(1 << 23)).toBe(true)
    expect(hasReportableInverterFault(0x00400c00 | (1 << 23))).toBe(true)
    expect(hasReportableInverterFault(0)).toBe(false)
    expect(hasReportableInverterFault(null)).toBe(false)
  })

  it('marks display names red only when not ignored PV faults', () => {
    expect(isReportableInverterFaultName('PV1 输入欠压')).toBe(false)
    expect(isReportableInverterFaultName('PV2 输入欠压')).toBe(false)
    expect(isReportableInverterFaultName('PV 电压异常')).toBe(false)
    expect(isReportableInverterFaultName('PV2反激硬件过流')).toBe(true)
    expect(isReportableInverterFaultName('PV1反激2路输入硬件过流')).toBe(true)
    expect(isReportableInverterFaultName('当前无故障')).toBe(false)
    expect(faultNameClassName('过热')).toBe('fault-name is-alert')
    expect(faultNameClassName('PV1 输入欠压')).toBe('fault-name is-soft')
    expect(faultNameClassName('当前无故障')).toBe('fault-clear')
  })

  it('annotates clear/soft current faults when 7-day history had reportable faults', () => {
    expect(hadRecentReportableInverterFault([
      { eventType: 'appeared', toFaults: ['PV2反激硬件过流'], fromFaults: [], toMask: 1 << 14, fromMask: 0 }
    ])).toBe(true)
    expect(hadRecentReportableInverterFault([
      { toFaults: ['PV2 输入欠压'], fromFaults: [], toMask: 1 << 11, fromMask: 0 }
    ])).toBe(false)
    expect(formatCurrentFaultLabel('当前无故障', true)).toBe('当前无故障（7日内存在故障）')
    expect(formatCurrentFaultLabel('PV2 输入欠压', true)).toBe('PV2 输入欠压（7日内存在故障）')
    expect(formatCurrentFaultLabel('当前无故障', false)).toBe('当前无故障')
    expect(formatCurrentFaultLabel('过热', true)).toBe('过热')
  })

  it('ignores recovery-only fromMask for the 7-day hint', () => {
    expect(hadRecentReportableInverterFault([
      {
        eventType: 'recovered',
        toFaults: [],
        fromFaults: ['PV2反激硬件过流'],
        toMask: 0,
        fromMask: 1 << 14
      }
    ])).toBe(false)
    expect(hadRecentReportableInverterFault([
      {
        eventType: 'recovered',
        toFaults: [],
        fromFaults: ['PV1 输入欠压', 'PV2 输入欠压', 'PV 电压异常'],
        toMask: 0,
        fromMask: 0x00400c00
      }
    ])).toBe(false)
    expect(hadRecentReportableInverterFault([
      {
        eventType: 'appeared',
        toFaults: ['硬件AC过压故障'],
        fromFaults: [],
        toMask: 1 << 5,
        fromMask: 0
      }
    ])).toBe(true)
  })
})
