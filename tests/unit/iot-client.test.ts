import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  getDevice,
  listAllDevices,
  listDevices,
  loadIotConfig,
  withRetry,
  IotConfigError,
  IotApiError
} from '@/src/adapters/iot-api/iot-client'

// 用一个可控的假 client 替换 axios.create，避免任何真实网络请求。
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

function makeDevice(id: string, pageIndex: number) {
  return {
    id,
    sn: `sn-${id}`,
    productId: '689adc659f04ec32f7642fbb',
    nickname: `device-${pageIndex}-${id}`,
    online: pageIndex % 2 === 0,
    product: { productNameCn: '防逆流控制器', productModel: 'GC-CTST3C' },
    moduleName: 'ESP32'
  }
}

describe('iot-client (mocked axios)', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockGet.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('listAllDevices 在 3 页数据下正确停止并合并', async () => {
    // total = 250，size = 100 → 3 页（100 / 100 / 50）
    const idsPage = (start: number, count: number, pageIndex: number) =>
      Array.from({ length: count }, (_, i) => makeDevice(`dev-${start + i}`, pageIndex))

    mockPost
      .mockResolvedValueOnce({ data: { code: 0, msg: 'ok', data: { total: 250, list: idsPage(0, 100, 0) } } })
      .mockResolvedValueOnce({ data: { code: 0, msg: 'ok', data: { total: 250, list: idsPage(100, 100, 1) } } })
      .mockResolvedValueOnce({ data: { code: 0, msg: 'ok', data: { total: 250, list: idsPage(200, 50, 2) } } })

    const devices = await listAllDevices({ productId: 'p1', size: 100 }, CONFIG)

    expect(devices).toHaveLength(250)
    expect(mockPost).toHaveBeenCalledTimes(3)
    // 不翻第 4 页
    expect(mockPost).toHaveBeenCalledTimes(3)
    // 末页最后一条
    expect(devices[249].id).toBe('dev-249')
  })

  it('listAllDevices 单页失败只告警并继续翻页', async () => {
    const serverError = new axios.AxiosError('boom', '', {} as never, undefined, { status: 500 } as never)
    // 第 1 页 3 次重试全部失败 → withRetry 抛错 → listAllDevices 记录告警并翻下一页
    mockPost
      .mockRejectedValueOnce(serverError)
      .mockRejectedValueOnce(serverError)
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce({ data: { code: 0, msg: 'ok', data: { total: 300, list: [makeDevice('dev-0', 1)] } } })
      .mockResolvedValueOnce({ data: { code: 0, msg: 'ok', data: { total: 300, list: [] } } })

    const warnings: string[] = []
    const devices = await listAllDevices(
      { productId: 'p1', size: 100, onWarning: (m) => warnings.push(m) },
      CONFIG
    )

    expect(devices).toHaveLength(1)
    expect(warnings.some((w) => w.includes('第 1 页'))).toBe(true)
    // 第 1 页 3 次重试 + 第 2、3 页各 1 次 = 5 次，证明没有因单页失败而中断
    expect(mockPost).toHaveBeenCalledTimes(5)
  })

  it('loadIotConfig 缺少 token 时抛出明确错误', () => {
    const prev = process.env.DREAM_MAKER_IOT_TOKEN
    delete process.env.DREAM_MAKER_IOT_TOKEN
    try {
      expect(() => loadIotConfig()).toThrow(IotConfigError)
      expect(() => loadIotConfig()).toThrow(/Set DREAM_MAKER_IOT_TOKEN/)
    } finally {
      if (prev !== undefined) process.env.DREAM_MAKER_IOT_TOKEN = prev
    }
  })

  it('5xx 在第三次成功后返回（重试 3 次）', async () => {
    const serverError = new axios.AxiosError('server error', '', {} as never, undefined, { status: 500 } as never)
    mockPost
      .mockRejectedValueOnce(serverError)
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce({ data: { code: 0, msg: 'ok', data: { total: 0, list: [] } } })

    const result = await listDevices({ productId: 'p1', page: 1, size: 100 }, CONFIG)
    expect(result.code).toBe(0)
    expect(mockPost).toHaveBeenCalledTimes(3)
  })

  it('业务 code !== 0 不重试直接抛出', async () => {
    mockPost.mockResolvedValueOnce({ data: { code: 401, msg: 'unauthorized', data: null } })

    await expect(listDevices({ productId: 'p1', page: 1, size: 100 }, CONFIG)).rejects.toThrow(IotApiError)
    // 不应重试：只调用一次
    expect(mockPost).toHaveBeenCalledTimes(1)
  })

  it('withRetry 对业务错误直接抛出不重试', async () => {
    const bizError = new IotApiError('biz', undefined, 1)
    const fn = vi.fn().mockRejectedValue(bizError)
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toThrow(IotApiError)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('getDevice 在 code !== 0 时返回 null', async () => {
    mockGet.mockResolvedValueOnce({ data: { code: 404, msg: 'not found', data: null } })
    const device = await getDevice({ deviceId: 'x', productId: 'p1' }, CONFIG)
    expect(device).toBeNull()
    expect(mockGet).toHaveBeenCalledTimes(1)
  })
})
