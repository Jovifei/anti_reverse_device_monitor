/**
 * 造梦者 IoT 平台 HTTP 客户端。
 *
 * 用于替代人工维护的 Excel（config/device-sn-map.xlsx）SN 映射层，
 * 直接调用 IoT 平台的 `getDevices` / `getDevice` 接口，自动建立
 * `device_id ↔ SN ↔ nickname` 三元映射。
 *
 * 安全约束：
 * - Bearer Token 只能从环境变量 DREAM_MAKER_IOT_TOKEN 读取，禁止硬编码。
 * - 这是后端脚本，不要冒充浏览器：不要带 Origin / Referer / sec-ch-ua* 等头。
 * - 使用自定义 User-Agent。
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import {
  iotDeviceSchema,
  iotDeviceResponseSchema,
  iotListResponseSchema,
  type IotDevice,
  type IotListResponse
} from './types'

/** IoT 平台默认 base URL。 */
export const DEFAULT_IOT_BASE_URL = 'https://iot.dream-maker.com'

/** 防逆流 CT 品类默认 productId（造梦者）。 */
export const DEFAULT_PRODUCT_ID = '689adc659f04ec32f7642fbb'

/** 自定义 User-Agent，明确标识这是后端同步脚本而非浏览器。 */
const USER_AGENT = 'anti-reverse-device-monitor/0.1 (iot-sync)'

/** 单页同步的安全上限，防止在拿不到 total 时无限翻页。 */
const MAX_SAFE_PAGES = 1000

/** IoT 客户端运行配置。 */
export type IotConfig = {
  baseUrl: string
  token: string
}

/** 配置缺失（如缺少 Token）时抛出。 */
export class IotConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IotConfigError'
  }
}

/** IoT 接口返回业务错误或网络/HTTP 错误时抛出。 */
export class IotApiError extends Error {
  /** HTTP 状态码（如果有）。 */
  readonly statusCode?: number
  /** IoT 业务 code（如果有）。 */
  readonly responseCode?: number

  constructor(message: string, statusCode?: number, responseCode?: number) {
    super(message)
    this.name = 'IotApiError'
    this.statusCode = statusCode
    this.responseCode = responseCode
  }
}

/** 读取 IoT 平台连接配置。缺失 Token 时抛出明确错误。 */
export function loadIotConfig(): IotConfig {
  const baseUrl = process.env.DREAM_MAKER_IOT_BASE_URL?.trim() || DEFAULT_IOT_BASE_URL
  const token = process.env.DREAM_MAKER_IOT_TOKEN?.trim()
  if (!token) {
    throw new IotConfigError('Set DREAM_MAKER_IOT_TOKEN in .env.local')
  }
  return { baseUrl, token }
}

/** 创建带鉴权头的 axios 实例（不携带任何浏览器相关头）。 */
function createClient(baseUrl: string, token: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: 30_000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT
    }
  })
}

/** 判断一个错误是否值得重试（5xx 服务端错误 / 网络抖动）。 */
function isRetryableError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const status = (error as AxiosError).response?.status
    // 5xx 服务端错误可重试
    if (status !== undefined && status >= 500 && status < 600) return true
    // 网络层错误（无响应）可重试
    if ((error as AxiosError).response === undefined && (error as AxiosError).code !== undefined) return true
    return false
  }
  return false
}

/** 等待指定毫秒数。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 包裹一个异步调用，在遇到 5xx / 网络抖动时按指数退避重试。
 * 业务错误（HTTP 2xx 但 code !== 0）或非可重试错误会直接抛出，不重试。
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { attempts: number; baseDelayMs: number } = { attempts: 3, baseDelayMs: 1000 }
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt >= options.attempts) break
      if (!isRetryableError(error)) throw error
      const delay = options.baseDelayMs * 2 ** (attempt - 1)
      await sleep(delay)
    }
  }
  throw lastError
}

/** `listDevices` 入参。 */
export type ListDevicesParams = {
  productId: string
  page: number
  size: number
  signal?: AbortSignal
}

/**
 * 查询单页设备列表（POST /api/device/getDevices）。
 * 内部对 HTTP 调用做 5xx / 网络重试；业务 code !== 0 不重试直接抛。
 */
export async function listDevices(params: ListDevicesParams, config: IotConfig = loadIotConfig()): Promise<IotListResponse> {
  const client = createClient(config.baseUrl, config.token)
  const raw = await withRetry(
    async () => {
      const result = await client.post<unknown>('/api/device/getDevices', {
        page: params.page,
        size: params.size,
        productId: params.productId
      }, { signal: params.signal })
      return result.data
    },
    { attempts: 3, baseDelayMs: 1000 }
  )

  const parsed = iotListResponseSchema.safeParse(raw)
  if (!parsed.success) {
    process.stderr.write(`IoT getDevices 响应解析失败。原始响应（前 500 字符）：${JSON.stringify(raw).slice(0, 500)}\n`)
    throw new IotApiError(`Invalid getDevices response: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`)
  }
  if (parsed.data.code !== 0) {
    // 业务错误：不重试，直接抛。
    throw new IotApiError(
      `getDevices 返回业务错误 code=${parsed.data.code}${parsed.data.msg ? `: ${parsed.data.msg}` : ''}`,
      undefined,
      parsed.data.code
    )
  }
  return parsed.data
}

/** `listAllDevices` 入参。 */
export type ListAllDevicesParams = {
  productId: string
  size?: number
  signal?: AbortSignal
  /** 每翻一页回调一次（成功或失败都回调），便于调用方统计页数。 */
  onPage?: (info: { page: number; deviceCount: number; failed: boolean }) => void
  /** 采集单页失败 / 字段异常等告警信息。 */
  onWarning?: (message: string) => void
}

/**
 * 自动翻页拉取某品类下的全部设备，直到列表为空或超出 total。
 * 单页失败只记录告警并继续翻下一页，不会让整个同步崩溃。
 * 返回经过 `iotDeviceSchema` 校验后的设备数组。
 */
export async function listAllDevices(
  params: ListAllDevicesParams,
  config: IotConfig = loadIotConfig()
): Promise<IotDevice[]> {
  const size = params.size ?? 100
  const productId = params.productId
  const devices: IotDevice[] = []
  let page = 1
  let totalPages = Infinity

  while (page <= totalPages && page <= MAX_SAFE_PAGES) {
    let response: IotListResponse
    try {
      response = await listDevices({ productId, page, size }, config)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      params.onWarning?.(`第 ${page} 页拉取失败，已跳过：${message}`)
      params.onPage?.({ page, deviceCount: 0, failed: true })
      page += 1
      continue
    }

    const total = response.data?.total ?? 0
    if (totalPages === Infinity && total > 0) {
      totalPages = Math.max(1, Math.ceil(total / size))
    }

    const rawList = response.data?.list ?? []
    let validInPage = 0
    for (const item of rawList) {
      const parsed = iotDeviceSchema.safeParse(item)
      if (!parsed.success) {
        params.onWarning?.(`第 ${page} 页存在字段异常的设备条目，已跳过：${JSON.stringify(item).slice(0, 200)}`)
        continue
      }
      if (!parsed.data.id) {
        params.onWarning?.(`第 ${page} 页存在缺失 id 的设备条目，已跳过：${JSON.stringify(item).slice(0, 200)}`)
        continue
      }
      devices.push(parsed.data)
      validInPage += 1
    }

    params.onPage?.({ page, deviceCount: validInPage, failed: false })

    // 列表为空即视为已到末页，提前停止。
    if (rawList.length === 0) break
    page += 1
  }

  return devices
}

/** `getDevice` 入参。 */
export type GetDeviceParams = {
  deviceId: string
  productId: string
  signal?: AbortSignal
}

/**
 * 查询单个设备详情（GET /api/device/getDevice）。
 * 本次需求主流程只调列表接口，此函数留作后续增强（完整 deviceKey / firmwareSeriesList 等）。
 * 设备不存在或 code !== 0 时返回 null。
 */
export async function getDevice(params: GetDeviceParams, config: IotConfig = loadIotConfig()): Promise<IotDevice | null> {
  const client = createClient(config.baseUrl, config.token)
  const raw = await withRetry(
    async () => {
      const result = await client.get<unknown>('/api/device/getDevice', {
        params: { deviceId: params.deviceId, productId: params.productId },
        signal: params.signal
      })
      return result.data
    },
    { attempts: 3, baseDelayMs: 1000 }
  )

  const parsed = iotDeviceResponseSchema.safeParse(raw)
  if (!parsed.success) {
    process.stderr.write(`IoT getDevice 响应解析失败。原始响应（前 500 字符）：${JSON.stringify(raw).slice(0, 500)}\n`)
    throw new IotApiError(`Invalid getDevice response: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`)
  }
  if (parsed.data.code !== 0) {
    return null
  }
  return parsed.data.data ?? null
}
