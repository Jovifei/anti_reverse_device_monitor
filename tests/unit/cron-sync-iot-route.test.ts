import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { execFile } from 'node:child_process'

// 用 mock 替换真实 child_process，避免测试时真正拉起 IoT 同步脚本（需要 DREAM_MAKER_IOT_TOKEN）。
vi.mock('node:child_process', () => ({
  execFile: vi.fn()
}))

type LooseMock = {
  mockImplementation: (fn: (...args: any[]) => void) => void
  mock: { calls: unknown[][] }
}
// 必须在 vi.mock hoist 之后从模块取值，拿到被 mock 的 execFile。
const execFileMock = vi.mocked(execFile) as unknown as LooseMock

import { GET, POST } from '../../app/api/cron/sync-iot/route'

const CRON_SECRET = 'super-secret-cron-token'

function makeRequest(token?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (token !== undefined) headers.authorization = `Bearer ${token}`
  return new NextRequest('http://localhost/api/cron/sync-iot', {
    method: 'POST',
    headers
  })
}

/** execFile 成功回调（符合 (err, stdout, stderr) 签名）。 */
function mockExecSuccess(report: Record<string, unknown>) {
  execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
    cb(null, JSON.stringify(report), '')
  })
}

/** execFile 失败回调，携带 stdout/stderr（模拟脚本非零退出）。 */
function mockExecFailure(stderr: string) {
  execFileMock.mockImplementation((_cmd, _args, _opts, cb) => {
    cb(Object.assign(new Error('command failed'), { code: 1 }), '', stderr)
  })
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', CRON_SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('POST /api/cron/sync-iot 鉴权', () => {
  it('缺少 Authorization 头 → 401', async () => {
    const response = await POST(makeRequest())
    expect(response.status).toBe(401)
    const body = (await response.json()) as { status: string }
    expect(body.status).toBe('unauthorized')
  })

  it('错误的 Bearer token → 401', async () => {
    const response = await POST(makeRequest('wrong-token'))
    expect(response.status).toBe(401)
    const body = (await response.json()) as { status: string }
    expect(body.status).toBe('unauthorized')
  })

  it('正确 token 但长度不同（时序安全比较应拒绝）→ 401', async () => {
    // 'super-secret-cron-token!!' 长度不同，仍应被 timingSafeEqual 拒绝（不泄露信息）。
    const response = await POST(makeRequest('super-secret-cron-token!!'))
    expect(response.status).toBe(401)
  })

  it('CRON_SECRET 未配置 → 503', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const response = await POST(makeRequest(CRON_SECRET))
    expect(response.status).toBe(503)
  })
})

describe('POST /api/cron/sync-iot 执行', () => {
  const sampleReport = {
    status: 'ok' as const,
    total: 372,
    pages: 4,
    added: 0,
    updated: 1,
    removed: 0,
    durationMs: 1234,
    output: 'config/devices.json',
    warnings: []
  }

  it('正确 Bearer + 脚本成功 → 200 + 透传报告', async () => {
    mockExecSuccess(sampleReport)
    const response = await POST(makeRequest(CRON_SECRET))
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.status).toBe('ok')
    expect(body.total).toBe(372)
    expect(typeof body.durationMs).toBe('number')
  })

  it('正确 Bearer + 脚本失败 → 500 + 截断 stderr', async () => {
    mockExecFailure('DB connection refused: ECONNREFUSED 127.0.0.1:27017')
    const response = await POST(makeRequest(CRON_SECRET))
    expect(response.status).toBe(500)
    const body = (await response.json()) as { status: string; message: string }
    expect(body.status).toBe('error')
    expect(body.message).toContain('ECONNREFUSED')
  })

  it('调用 execFile 透传 node + tsx 二进制执行同步脚本', async () => {
    mockExecSuccess(sampleReport)
    await POST(makeRequest(CRON_SECRET))
    expect(execFileMock.mock.calls.length).toBe(1)
    const [cmd, args] = execFileMock.mock.calls[0] as [string, string[]]
    expect(cmd).toContain('node')
    expect(args.join(' ')).toContain('tsx')
    expect(args.join(' ')).toContain('sync-iot-device-registry.ts')
  })
})

describe('GET /api/cron/sync-iot 健康检查', () => {
  it('无需鉴权，返回 { ok: true }', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const body = (await response.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
  })
})
