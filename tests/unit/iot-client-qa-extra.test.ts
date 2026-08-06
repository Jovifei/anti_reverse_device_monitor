/**
 * 独立 QA 补充测试（严过关）。
 *
 * 目标：站在「不信任交付方自测」的角度，对 iot-client 做额外健壮性验证。
 * 全部使用 vi.mock('axios')，不与真实网络交互。
 *
 * 覆盖：
 *  1. IoT 响应中某条缺 id / 缺 sn 时，listAllDevices 仍返回其余有效设备、不崩溃。
 *  2. total 与实际返回条数不符时不死循环、能正常结束。
 *  3. total 缺失时依赖「空列表即末页」终止翻页，不会触达 MAX_SAFE_PAGES。
 *  4. loadIotConfig 在 DREAM_MAKER_IOT_TOKEN 为空字符串 / 纯空白时也应抛错。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listAllDevices,
  loadIotConfig,
  IotConfigError
} from '@/src/adapters/iot-api/iot-client'

// 用可控的假 client 替换 axios.create，避免任何真实网络请求。
const mockPost = vi.fn()
const mockGet = vi.fn()
vi.mock('axios', async (importOriginal) => {
  const mod = await importOriginal<typeof import('axios')>()
  return {
    ...mod,
    default: {
      ...mod.default,
      create: vi.fn(() => ({ post: mockPost, get: mockGet }))
    }
  }
})

const CONFIG = { baseUrl: 'https://iot.dream-maker.com', token: 'fake-token' }

describe('iot-client QA extra (independent, mocked axios)', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockGet.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('listAllDevices 跳过缺 id 的条目、保留缺 sn 但含 id 的条目', async () => {
    mockPost.mockResolvedValueOnce({
      data: {
        code: 0,
        msg: 'ok',
        data: {
          total: 3,
          list: [
            { id: 'dev-ok', sn: 'sn-ok', nickname: 'n', online: true },
            { sn: 'sn-no-id' }, // 缺 id → 应跳过
            { id: 'dev-nosn', nickname: 'n2', online: false } // 缺 sn → 应保留（sn 后续走占位）
          ]
        }
      }
    })

    const warnings: string[] = []
    const devices = await listAllDevices(
      { productId: 'p1', size: 100, onWarning: (m) => warnings.push(m) },
      CONFIG
    )

    expect(devices).toHaveLength(2)
    const ids = devices.map((d) => d.id).sort()
    expect(ids).toEqual(['dev-nosn', 'dev-ok'])
    // 缺失 id 的条目应产生告警
    expect(warnings.some((w) => w.includes('缺失 id'))).toBe(true)
  })

  it('total 与实际返回条数不符时不死循环、能正常结束', async () => {
    // total=5 但只返回 2 条；size=100 → totalPages=1，首页后即停止翻页。
    mockPost.mockResolvedValueOnce({
      data: {
        code: 0,
        msg: 'ok',
        data: {
          total: 5,
          list: [
            { id: 'dev-0', sn: 'sn-0' },
            { id: 'dev-1', sn: 'sn-1' }
          ]
        }
      }
    })

    const devices = await listAllDevices({ productId: 'p1', size: 100 }, CONFIG)

    expect(devices).toHaveLength(2)
    // 仅请求了 1 页即终止，证明没有因 total 与实际不符而死循环。
    expect(mockPost).toHaveBeenCalledTimes(1)
  })

  it('total 缺失时靠空列表终止翻页，不会触达 MAX_SAFE_PAGES', async () => {
    // 没有任何 total，依靠「空列表即末页」提前停止。
    mockPost
      .mockResolvedValueOnce({
        data: {
          code: 0,
          msg: 'ok',
          data: {
            list: [
              { id: 'dev-0', sn: 'sn-0' },
              { id: 'dev-1', sn: 'sn-1' },
              { id: 'dev-2', sn: 'sn-2' }
            ]
          }
        }
      })
      .mockResolvedValueOnce({ data: { code: 0, msg: 'ok', data: { list: [] } } })

    const devices = await listAllDevices({ productId: 'p1', size: 100 }, CONFIG)

    expect(devices).toHaveLength(3)
    // 仅 2 页即停止，远低于 MAX_SAFE_PAGES 上限。
    expect(mockPost).toHaveBeenCalledTimes(2)
  })

  it('loadIotConfig 在 token 为空字符串时抛错', () => {
    const prev = process.env.DREAM_MAKER_IOT_TOKEN
    process.env.DREAM_MAKER_IOT_TOKEN = ''
    try {
      expect(() => loadIotConfig()).toThrow(IotConfigError)
      expect(() => loadIotConfig()).toThrow(/DREAM_MAKER_IOT_TOKEN/)
    } finally {
      if (prev !== undefined) process.env.DREAM_MAKER_IOT_TOKEN = prev
      else delete process.env.DREAM_MAKER_IOT_TOKEN
    }
  })

  it('loadIotConfig 在 token 仅含空白字符时抛错', () => {
    const prev = process.env.DREAM_MAKER_IOT_TOKEN
    process.env.DREAM_MAKER_IOT_TOKEN = '   '
    try {
      expect(() => loadIotConfig()).toThrow(IotConfigError)
      expect(() => loadIotConfig()).toThrow(/DREAM_MAKER_IOT_TOKEN/)
    } finally {
      if (prev !== undefined) process.env.DREAM_MAKER_IOT_TOKEN = prev
      else delete process.env.DREAM_MAKER_IOT_TOKEN
    }
  })
})
