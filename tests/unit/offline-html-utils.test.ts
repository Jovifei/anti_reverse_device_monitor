import { describe, expect, it } from 'vitest'
import {
  disconnectDailyResetPoints,
  displayOrEmpty,
  escapeHtml,
  mapSourceLabel,
  safeFileToken
} from '@/src/export/offline/html-utils'
import { EMPTY } from '@/src/export/offline/types'

describe('offline html utils', () => {
  it('escapes html', () => {
    expect(escapeHtml(`<b a="1" b='2'>&`)).toBe('&lt;b a=&quot;1&quot; b=&#39;2&#39;&gt;&amp;')
  })

  it('sanitizes file tokens', () => {
    expect(safeFileToken('DEMO-CT/ONLINE 001')).toBe('DEMO-CT-ONLINE-001')
    expect(safeFileToken('@@@')).toBe('device')
  })

  it('maps missing values to dash', () => {
    expect(displayOrEmpty(undefined)).toBe(EMPTY)
    expect(displayOrEmpty('null')).toBe(EMPTY)
    expect(displayOrEmpty('NaN')).toBe(EMPTY)
    expect(displayOrEmpty('12.3')).toBe('12.3')
  })

  it('disconnects today-energy across day boundary', () => {
    process.env.APP_TIMEZONE = 'Asia/Shanghai'
    const points = disconnectDailyResetPoints([
      ['2026-07-22T10:00:00.000Z', 8],
      ['2026-07-23T01:00:00.000Z', 0.2]
    ])
    expect(points).toEqual([
      ['2026-07-22T10:00:00.000Z', 8],
      ['2026-07-23T01:00:00.000Z', null],
      ['2026-07-23T01:00:00.000Z', 0.2]
    ])
  })

  it('maps source labels', () => {
    expect(mapSourceLabel('ui-demo')).toBe('Demo SQLite')
    expect(mapSourceLabel('excel')).toBe('Excel 导入')
    expect(mapSourceLabel('company-readonly')).toBe('公司数据库同步')
    expect(mapSourceLabel(null, '自定义')).toBe('自定义')
  })
})
