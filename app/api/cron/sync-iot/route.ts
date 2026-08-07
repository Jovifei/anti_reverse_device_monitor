import { type NextRequest, NextResponse } from 'next/server'
import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import path from 'node:path'

export const dynamic = 'force-dynamic'

/** 调度同步脚本的最大执行时间（毫秒）。 */
const SYNC_TIMEOUT_MS = 120_000
/** 捕获子进程 stdout/stderr 的缓冲上限（10 MiB），防止超大输出撑爆内存。 */
const MAX_BUFFER_BYTES = 10 * 1024 * 1024

/**
 * 常量时间比较，防止时序攻击泄露 CRON_SECRET 长度/内容。
 * 长度不同直接返回 false（timingSafeEqual 要求等长的 Buffer，否则抛错）。
 */
function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/** 从 Authorization 头提取 Bearer token；格式不符返回 null。 */
function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}

/**
 * 从同步脚本的 stdout 中解析 JSON 报告。
 * 脚本在成功路径只 `console.log` 一行 JSON.stringify(report)（`--dry-run` 才会输出 preview，
 * 路由不带该 flag，因此 stdout 整体即报告）。为兼容潜在的其它诊断输出，按以下顺序回退：
 * 1) 整段 trim 后直接 JSON.parse；
 * 2) 逐行从后往前找首个可解析为对象的有效行；
 * 3) 截取最后一个 `{...}` 片段。
 */
function parseSyncReport(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim()
  if (!trimmed) return {}

  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    // 继续按行/片段回退。
  }

  const lines = trimmed.split('\n').filter((line) => line.trim().length > 0)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const value = JSON.parse(lines[i])
      if (value && typeof value === 'object') return value as Record<string, unknown>
    } catch {
      // 继续往前找。
    }
  }

  const lastClose = trimmed.lastIndexOf('}')
  const lastOpen = trimmed.lastIndexOf('{')
  if (lastClose > lastOpen && lastOpen >= 0) {
    const slice = trimmed.slice(lastOpen, lastClose + 1)
    try {
      return JSON.parse(slice) as Record<string, unknown>
    } catch {
      // 兜底返回空对象。
    }
  }

  return {}
}

/**
 * 以 `node + tsx` 二进制直接执行 IoT 同步脚本（避免 `npm run` 嵌套 shell 的 PATH / Windows 兼容问题）。
 * 不通过 npm wrapper，命令与环境完全可控；使用 child_process 回调语义（err, stdout, stderr）。
 */
function runIotSyncScript(): Promise<{ stdout: string; stderr: string }> {
  const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')
  const scriptPath = path.join(process.cwd(), 'scripts', 'sync-iot-device-registry.ts')

  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [tsxCli, scriptPath],
      {
        cwd: process.cwd(),
        timeout: SYNC_TIMEOUT_MS,
        env: process.env,
        maxBuffer: MAX_BUFFER_BYTES
      },
      (error, stdout, stderr) => {
        if (error) {
          const wrapped = error as Error & { stdout?: string; stderr?: string }
          wrapped.stdout = stdout
          wrapped.stderr = stderr
          reject(wrapped)
        } else {
          resolve({ stdout, stderr })
        }
      }
    )
  })
}

/** 轻量健康检查 / liveness，无需鉴权。 */
export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) {
    return NextResponse.json(
      { status: 'error', message: 'CRON_SECRET 未配置，无法执行受保护同步' },
      { status: 503 }
    )
  }

  const token = extractBearerToken(request)
  if (!token || !timingSafeEqualString(token, expectedSecret)) {
    return NextResponse.json(
      { status: 'unauthorized', message: '缺少或无效的 Authorization 凭证' },
      { status: 401 }
    )
  }

  const startedAt = Date.now()

  try {
    const { stdout, stderr } = await runIotSyncScript()

    const report = parseSyncReport(stdout)
    const durationMs = Date.now() - startedAt
    const total = typeof report.total === 'number' ? report.total : undefined
    console.log('iot sync:', JSON.stringify({ status: 'ok', total, durationMs }))

    return NextResponse.json({
      status: 'ok',
      total,
      durationMs,
      ...report
    })
  } catch (error) {
    const err = error as {
      stderr?: string
      stdout?: string
      message?: string
      code?: string
      killed?: boolean
      signal?: string
    } | null
    const detail = (err?.stderr || err?.stdout || err?.message || String(error)).slice(0, 500)
    const durationMs = Date.now() - startedAt
    console.error('iot sync failed:', detail)
    return NextResponse.json(
      {
        status: 'error',
        durationMs,
        message: detail
      },
      { status: 500 }
    )
  }
}
