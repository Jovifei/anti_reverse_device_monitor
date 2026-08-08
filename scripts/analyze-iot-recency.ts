/**
 * IoT 设备 7 日活跃分析报告。
 *
 * 用法：
 *   npm run devices:analyze-recency                       # 默认 productId（计划约定的 6a02f379...）
 *   npm run devices:analyze-recency -- --product-id <id> # 覆盖品类
 *   npm run devices:analyze-recency -- --out-dir <path>   # 覆盖输出目录（默认 reports/）
 *   npm run devices:analyze-recency -- --size <n>         # 覆盖每页大小
 *
 * 数据源：
 *   - 造梦者 / iot.iald.cn IoT 平台 `getDevices`（全量拉取）
 *   - 本地 SQLite `Device` 表（deviceSn / lastReportedAt / platformOnline）
 *
 * 输出：
 *   - reports/iot-recency-YYYY-MM-DD.md（人类可读摘要）
 *   - reports/iot-recency-YYYY-MM-DD.bucketA.json / bucketB.json / bucketC.json（全量明细）
 *   - stdout 一行汇总：{"total":..., "A":..., "B":..., "C":..., "D":..., "warnings":N, "ms":...}
 *
 * 安全约束（继承 src/adapters/iot-api/iot-client.ts 的约定）：
 *   - Bearer Token 仅从环境变量 DREAM_MAKER_IOT_TOKEN 读取，禁止硬编码 / 日志输出。
 *   - 报告里不出现 token 明文；SN/Device ID 是公司资产，落盘目录已 gitignore。
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadLocalEnvironment } from '@/src/adapters/source-db/config'
import {
  listAllDevices,
  loadIotConfig,
  IotConfigError,
  IotApiError
} from '@/src/adapters/iot-api/iot-client'
import type { IotDevice } from '@/src/adapters/iot-api/types'
import { prisma } from '@/src/lib/prisma'

const DEFAULT_PRODUCT_ID = '6a02f379ad14f363eef24890'
const DEFAULT_SIZE = 100
const DEFAULT_OUT_DIR = 'reports'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/** Markdown / JSON 单桶一条记录。 */
type BucketRow = {
  sn: string | null
  deviceId: string | null
  nickname: string | null
  iotOnline: boolean | null
  sqliteLastReportedAt: string | null
  /** 距 now 的天数（仅 B/C 桶需要展示，A 桶无值）；保留 1 位小数。 */
  daysSinceLastReport: number | null
}

type BucketSummary = {
  count: number
  rows: BucketRow[]
}

/** 分桶结果（仅保留统计与明细，便于报告模板化）。 */
export type AnalysisResult = {
  generatedAt: Date
  productId: string
  baseUrl: string
  totalRegistered: number
  bucketA: BucketSummary
  bucketB: BucketSummary
  bucketC: BucketSummary
  bucketD: BucketSummary
  iotPages: number
  warnings: string[]
  durationMs: number
}

/**
 * 纯函数：把 IoT 拉到的设备列表 × SQLite Device 快照分桶。
 * 暴露此函数便于单元测试；`main()` 也直接复用。
 */
export function summarizeIoTDevices(input: {
  iotDevices: IotDevice[]
  deviceBySn: Map<string, { lastReportedAt: Date | null; platformOnline: boolean }>
  now: Date
  sevenDaysMs?: number
}): Pick<AnalysisResult, 'bucketA' | 'bucketB' | 'bucketC' | 'bucketD'> {
  const sevenDaysMs = input.sevenDaysMs ?? SEVEN_DAYS_MS
  const cutoff = input.now.getTime() - sevenDaysMs
  const bucketA: BucketRow[] = []
  const bucketB: BucketRow[] = []
  const bucketC: BucketRow[] = []
  const iotSnSet = new Set<string>()
  for (const iot of input.iotDevices) {
    const sn = pickIotSn(iot)
    if (sn) iotSnSet.add(sn)
    const sqlite = sn ? input.deviceBySn.get(sn) : undefined
    const last = sqlite?.lastReportedAt ?? null
    if (!last) {
      bucketA.push(buildRow(iot, null, null))
      continue
    }
    const days = daysBetween(input.now, last)
    if (last.getTime() >= cutoff) {
      bucketB.push(buildRow(iot, last, days))
    } else {
      bucketC.push(buildRow(iot, last, days))
    }
  }
  // 桶 D：SQLite 有、IoT 无。
  const bucketD: BucketRow[] = []
  for (const [sn, info] of input.deviceBySn.entries()) {
    if (iotSnSet.has(sn)) continue
    bucketD.push({
      sn,
      deviceId: null,
      nickname: null,
      iotOnline: null,
      sqliteLastReportedAt: info.lastReportedAt ? info.lastReportedAt.toISOString() : null,
      daysSinceLastReport: info.lastReportedAt ? daysBetween(input.now, info.lastReportedAt) : null
    })
  }
  const bySn = (a: BucketRow, b: BucketRow) => (a.sn ?? '').localeCompare(b.sn ?? '')
  bucketA.sort(bySn)
  bucketC.sort(bySn)
  bucketD.sort(bySn)
  bucketB.sort((a, b) => (b.sqliteLastReportedAt ?? '').localeCompare(a.sqliteLastReportedAt ?? ''))
  return {
    bucketA: { count: bucketA.length, rows: bucketA },
    bucketB: { count: bucketB.length, rows: bucketB },
    bucketC: { count: bucketC.length, rows: bucketC },
    bucketD: { count: bucketD.length, rows: bucketD }
  }
}

function flagValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name)
}

function formatBeijing(d: Date): string {
  return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const s = String(value)
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function pickIotSn(device: IotDevice): string | null {
  const trimmed = device.sn?.trim()
  return trimmed ? trimmed : null
}

function pickIotDeviceId(device: IotDevice): string | null {
  const id = device.id?.trim()
  return id ? id : null
}

/**
 * 构造 BucketRow。
 * @param daysSinceLastReport 距 now 的天数（小时数 / 24）；A 桶传 null。
 */
function buildRow(
  iot: IotDevice,
  sqliteLastReportedAt: Date | null,
  daysSinceLastReport: number | null
): BucketRow {
  return {
    sn: pickIotSn(iot),
    deviceId: pickIotDeviceId(iot),
    nickname: iot.nickname?.trim() || null,
    iotOnline: typeof iot.online === 'boolean' ? iot.online : null,
    sqliteLastReportedAt: sqliteLastReportedAt ? sqliteLastReportedAt.toISOString() : null,
    daysSinceLastReport
  }
}

function daysBetween(now: Date, past: Date): number {
  return Math.round(((now.getTime() - past.getTime()) / 86_400_000) * 10) / 10
}

export function renderMarkdown(result: AnalysisResult): string {
  const { generatedAt, productId, baseUrl, totalRegistered, bucketA, bucketB, bucketC, bucketD } = result
  const total = bucketA.count + bucketB.count + bucketC.count + bucketD.count
  const pct = (n: number) => (total === 0 ? '0.0%' : `${((n / total) * 100).toFixed(1)}%`)

  const head = [
    '# IoT 设备 7 日活跃分析报告',
    '',
    `- 生成时间（北京时间）：${formatBeijing(generatedAt)}`,
    `- IoT base URL：${baseUrl}`,
    `- 产品 ID：${productId}`,
    `- 公司注册设备总数：${totalRegistered}（脚本仅分析 IoT 全集，不与 config/devices.json 强绑定）`,
    '',
    '## 摘要',
    '',
    '| 桶 | 数量 | 占比 |',
    '|---|---:|---:|',
    `| A. 7+ 日离线 · 从未上报（疑似出厂测试） | ${bucketA.count} | ${pct(bucketA.count)} |`,
    `| B. 近 7 日内上线（需要关注）           | ${bucketB.count} | ${pct(bucketB.count)} |`,
    `| C. 7+ 日离线 · 曾活跃（沉寂）           | ${bucketC.count} | ${pct(bucketC.count)} |`,
    `| D. 仅 SQLite / IoT 未列出（孤儿）        | ${bucketD.count} | ${pct(bucketD.count)} |`,
    ''
  ].join('\n')

  const renderBucket = (
    title: string,
    subtitle: string,
    summary: BucketSummary,
    showDays: boolean,
    extraNote?: string
  ): string => {
    const sampleLimit = 50
    const sample = summary.rows.slice(0, sampleLimit)
    const lines: string[] = ['', `## ${title}`, '', `_${subtitle}_`, '']
    if (extraNote) lines.push(`> ${extraNote}`, '')
    if (summary.count === 0) {
      lines.push('（空）', '')
      return lines.join('\n')
    }
    const headerDays = showDays ? '距今天数' : 'SQLite lastReportedAt'
    lines.push(
      `| SN | Device ID | nickname | IoT online | ${headerDays} |`,
      '|---|---|---|---|---|'
    )
    for (const r of sample) {
      const last = showDays
        ? r.daysSinceLastReport !== null
          ? `${r.daysSinceLastReport} d`
          : '—'
        : r.sqliteLastReportedAt ?? '—'
      lines.push(
        `| ${escapeCell(r.sn)} | ${escapeCell(r.deviceId)} | ${escapeCell(r.nickname)} | ${
          r.iotOnline === null ? '—' : r.iotOnline ? 'true' : 'false'
        } | ${escapeCell(last)} |`
      )
    }
    if (summary.rows.length > sampleLimit) {
      lines.push(
        '',
        `> 仅展示前 ${sampleLimit} 条；完整 ${summary.count} 条见同日同名 \`.json\` 文件（reports/，已 gitignore）。`
      )
    }
    return lines.join('\n')
  }

  const bucketASection = renderBucket(
    'A. 7+ 日离线 · 从未上报',
    'IoT 注册过、但本地 SQLite 中无任何遥测记录 — 多为出厂测试、卖出去后从未上线',
    bucketA,
    false,
    '建议核对：是否需要清理注册表、或激活/重新发货？'
  )

  const bucketBSection = renderBucket(
    'B. 近 7 日内上线（需要关注）',
    'IoT 注册、且 `lastReportedAt` 在 7 日窗口内 — 刚开始活跃，主动跟进',
    bucketB,
    true,
    '建议：确认设备归属客户 / 现场环境是否正常。'
  )

  const bucketCSection = renderBucket(
    'C. 7+ 日离线 · 曾活跃（沉寂）',
    'IoT 注册、本地曾经上报过、但最近一次上报早于 7 日 — 曾经活跃，现已沉寂',
    bucketC,
    true
  )

  const bucketDSection =
    bucketD.count === 0
      ? '\n## D. 反向警告\n\n（空）\n\n- 无 IoT 缺失但 SQLite 存在的设备。\n'
      : `\n## D. 反向警告\n\n- 共 ${bucketD.count} 台设备仅在 SQLite 存在、IoT 全集未返回（IoT 平台已删除 / 未注册 / 跨 productId）。\n  - 列表略：脚本同时落盘同名 \`.bucketD.json\` 备查。\n`

  const stats = [
    '',
    '## 拉取统计',
    '',
    `- 翻页：${result.iotPages} 页`,
    `- 拉取/分析耗时：${result.durationMs} ms`,
    `- onWarning 数：${result.warnings.length}`,
    result.warnings.length > 0
      ? `- 前 10 条警告：\n${result.warnings.slice(0, 10).map((w) => `  - ${w.replace(/\n/g, ' ')}`).join('\n')}`
      : '- 无警告'
  ].join('\n')

  return [head, bucketASection, bucketBSection, bucketCSection, bucketDSection, stats, ''].join('\n')
}

async function main(): Promise<void> {
  const startedAt = Date.now()
  loadLocalEnvironment()

  const productId =
    flagValue('--product-id')?.trim() ||
    process.env.IOT_RECENCY_PRODUCT_ID?.trim() ||
    DEFAULT_PRODUCT_ID
  const size = Math.max(
    1,
    Number(flagValue('--size') || process.env.DREAM_MAKER_IOT_PAGE_SIZE || DEFAULT_SIZE) || DEFAULT_SIZE
  )
  const outDir = path.resolve(process.cwd(), flagValue('--out-dir')?.trim() || DEFAULT_OUT_DIR)

  // Token 缺失会抛 IotConfigError（与 daily sync 同款错误）。
  const config = loadIotConfig()
  const now = new Date()

  fs.mkdirSync(outDir, { recursive: true })

  const warnings: string[] = []
  let iotPages = 0
  let iotDevices: IotDevice[] = []
  try {
    iotDevices = await listAllDevices(
      {
        productId,
        size,
        onPage: (info) => {
          iotPages = Math.max(iotPages, info.page)
        },
        onWarning: (message) => warnings.push(message)
      },
      config
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`IoT 拉取失败：${message}\n`)
    process.exit(1)
  }

  // 拉取 SQLite Device 全表（按 SN 建 Map）。
  const deviceRows = await prisma.device.findMany({
    select: { deviceSn: true, lastReportedAt: true, platformOnline: true }
  })
  const deviceBySn = new Map<string, { lastReportedAt: Date | null; platformOnline: boolean }>()
  for (const row of deviceRows) {
    deviceBySn.set(row.deviceSn, {
      lastReportedAt: row.lastReportedAt,
      platformOnline: row.platformOnline
    })
  }

  // 分桶。
  const buckets = summarizeIoTDevices({
    iotDevices,
    deviceBySn,
    now
  })

  const result: AnalysisResult = {
    generatedAt: now,
    productId,
    baseUrl: config.baseUrl,
    totalRegistered: iotDevices.length,
    bucketA: buckets.bucketA,
    bucketB: buckets.bucketB,
    bucketC: buckets.bucketC,
    bucketD: buckets.bucketD,
    iotPages,
    warnings,
    durationMs: Date.now() - startedAt
  }

  // 落盘：Markdown 报告 + 每桶 JSON（同 stem）。
  const stamp = now.toISOString().slice(0, 10) // YYYY-MM-DD（北京时间需要 hour；先用 UTC 日期避免歧义，用户报告里另含 toLocaleString）
  const stem = `iot-recency-${stamp}`
  const mdPath = path.join(outDir, `${stem}.md`)
  const jsonPath = (suffix: string) => path.join(outDir, `${stem}.${suffix}.json`)

  fs.writeFileSync(mdPath, renderMarkdown(result), 'utf8')
  fs.writeFileSync(jsonPath('bucketA'), JSON.stringify(buckets.bucketA, null, 2), 'utf8')
  fs.writeFileSync(jsonPath('bucketB'), JSON.stringify(buckets.bucketB, null, 2), 'utf8')
  fs.writeFileSync(jsonPath('bucketC'), JSON.stringify(buckets.bucketC, null, 2), 'utf8')
  if (buckets.bucketD.count > 0)
    fs.writeFileSync(jsonPath('bucketD'), JSON.stringify(buckets.bucketD, null, 2), 'utf8')

  process.stdout.write(
    `${JSON.stringify(
      {
        status: 'ok',
        report: path.relative(process.cwd(), mdPath),
        total: result.totalRegistered,
        A: result.bucketA.count,
        B: result.bucketB.count,
        C: result.bucketC.count,
        D: result.bucketD.count,
        warnings: result.warnings.length,
        ms: result.durationMs
      },
      null,
      2
    )}\n`
  )

  await prisma.$disconnect()
}

main().catch(async (error) => {
  if (error instanceof IotConfigError || error instanceof IotApiError) {
    process.stderr.write(`${error.message}\n`)
  } else if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`)
  } else {
    process.stderr.write(`${String(error)}\n`)
  }
  await prisma.$disconnect().catch(() => undefined)
  process.exit(1)
})