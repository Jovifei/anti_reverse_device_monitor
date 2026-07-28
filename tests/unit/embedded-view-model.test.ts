import { describe, expect, it } from 'vitest'
import { extractEmbeddedOfflineViewModel } from '@/src/export/offline/embedded-view-model'

describe('embedded offline view model', () => {
  it('reads the view model from an existing offline HTML document', () => {
    const model = extractEmbeddedOfflineViewModel(
      '<script>window.__OFFLINE_VM__ = {"kind":"device","deviceSn":"GC2001000000092"};</script>'
    )
    expect(model.kind).toBe('device')
    expect((model as { deviceSn: string }).deviceSn).toBe('GC2001000000092')
  })

  it('rejects absent and malformed embedded view models', () => {
    expect(() => extractEmbeddedOfflineViewModel('<html></html>')).toThrow('没有可读取')
    expect(() => extractEmbeddedOfflineViewModel('<script>window.__OFFLINE_VM__ = nope;</script>')).toThrow('不是有效 JSON')
  })
})
