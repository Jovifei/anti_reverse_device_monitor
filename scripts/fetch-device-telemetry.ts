#!/usr/bin/env -S node --env-file=.env.local
/**
 * fetch-device-telemetry.ts  (READ-ONLY — 绝不写/改 Mongo)
 *
 * 从 Mongo 遥测集合（默认 device_log_689adc659f04ec32f7642fbb）拉取每台真实设备
 * 的「最后上报时间」(time, Unix 秒)，用于计算 7 日活跃窗口：
 *   - 近 7 日以上无上报（或从未上报）→ 疑似出厂测试注册、售出后未上线（Bucket A）
 *   - 近 7 日内有上报 → 刚起步上线、需关注（Bucket B）
 * 与 IoT 实时 online 状态合并，输出报告。
 *
 * 用法: npm run devices:fetch-telemetry
 * 依赖: reports/iot-real-devices-<date>.json（由 devices:fetch-real 生成，提供 deviceId/sn/nickname/online）
 * 环境变量: MONGODB_URI / MONGODB_DATABASE / MONGODB_COLLECTION / MONGODB_PRODUCT_ID (来自 .env.local)
 */
import { MongoClient } from 'mongodb'
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyTelemetryActivity } from '@/src/domain/iot-telemetry-activity'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const NOW = Date.now()

type DeviceSeed = { deviceId: string; sn: string; nickname: string; online: boolean }
type Enriched = DeviceSeed & {
  lastReportedAt: string | null // ISO or null
  daysSinceReport: number | null
  bucket: 'recent_7d' | 'stale_7d_plus' | 'never_reported'
  active: boolean
  activitySource: ReturnType<typeof classifyTelemetryActivity>['source']
}

function loadSeeds(dir: string): DeviceSeed[] {
  // 优先用最新一次 IoT 实拉快照
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
    .filter((f: string) => /^iot-real-devices-.*\.json$/.test(f))
    .sort()
  if (files.length === 0) return []
  const latest = readFileSync(join(dir, files[files.length - 1]), 'utf8')
  const data = JSON.parse(latest)
  return (data.devices || []).map((d: any) => ({
    deviceId: d.deviceId,
    sn: d.sn ?? '',
    nickname: d.nickname ?? '',
    online: !!d.online,
  }))
}

function buildUri(): string {
  const uri = process.env.MONGODB_URI?.trim() ?? ''
  if (!uri) throw new Error('MONGODB_URI 未设置')
  return uri
}

async function main(): Promise<void> {
  const outDir = process.env.IOT_REAL_OUT_DIR?.trim() || 'reports'
  const seeds = loadSeeds(outDir)
  if (seeds.length === 0) {
    console.error(`未找到 IoT 实拉快照 (${outDir}/iot-real-devices-*.json)，请先运行 npm run devices:fetch-real`)
    process.exit(1)
  }
  const database = process.env.MONGODB_DATABASE?.trim() || 'zeico_cloud'
  const productId = process.env.MONGODB_PRODUCT_ID?.trim() || '689adc659f04ec32f7642fbb'
  const collection = process.env.MONGODB_COLLECTION?.trim() || `device_log_${productId}`

  const uri = buildUri()
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 60000,
    maxPoolSize: 2,
  })
  try {
    await client.connect()
    console.error('Mongo connected (read-only)')
    const db = client.db(database)
    const coll = db.collection(collection)
    const deviceIds = seeds.map((s) => s.deviceId)

    // 一次性聚合：每台设备最新 time + 文档数（只读 aggregate）
    const agg = await coll
      .aggregate<{ _id: string; lastTime: number | null; count: number }>([
        { $match: { device_id: { $in: deviceIds } } },
        { $group: { _id: '$device_id', lastTime: { $max: '$time' }, count: { $sum: 1 } } },
      ])
      .toArray()

    const byId = new Map(agg.map((r) => [r._id, r]))
    console.error(`聚合完成：有遥测的设备 ${agg.length} / ${deviceIds.length}`)

    const enriched: Enriched[] = seeds.map((s) => {
      const rec = byId.get(s.deviceId)
      const lastMs = rec?.lastTime == null ? null : rec.lastTime * 1000
      const days = lastMs == null ? null : (NOW - lastMs) / 86400000
      const activity = classifyTelemetryActivity({ online: s.online, lastTime: rec?.lastTime ?? null, nowMs: NOW })
      return {
        ...s,
        lastReportedAt: lastMs == null ? null : new Date(lastMs).toISOString(),
        daysSinceReport: days == null ? null : Math.round(days * 10) / 10,
        bucket: activity.bucket,
        active: activity.active,
        activitySource: activity.source
      }
    })

    const recent = enriched.filter((e) => e.bucket === 'recent_7d').sort((a, b) => (a.daysSinceReport ?? 0) - (b.daysSinceReport ?? 0))
    const stale = enriched.filter((e) => e.bucket === 'stale_7d_plus')
    const never = enriched.filter((e) => e.bucket === 'never_reported')
    const staleAll = [...stale, ...never] // 7+ 天无上报（含从未上报）

    const date = new Date().toISOString().slice(0, 10)
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
    const jsonPath = join(outDir, `iot-telemetry-7d-${date}.json`)
    const mdPath = join(outDir, `iot-telemetry-7d-${date}.md`)
    writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          fetchedAt: new Date().toISOString(),
          collection,
          sevenDaysMs: SEVEN_DAYS_MS,
          summary: {
            total: enriched.length,
            active7d: enriched.filter((entry) => entry.active).length,
            iotOnlineOnly: enriched.filter((entry) => entry.activitySource === 'iot-online').length,
            mongoRecent7d: enriched.filter((entry) => entry.activitySource === 'mongo-recent' || entry.activitySource === 'iot-online+mongo-recent').length,
            recent7d: recent.length,
            stale7dPlus: stale.length,
            neverReported: never.length
          },
          recent7d: recent,
          stale7dPlus: stale,
          neverReported: never,
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(mdPath, renderMarkdown(enriched, recent, stale, never, collection), 'utf8')
    console.error(`\n✅ 完成：近7日活跃（Mongo 上报或 IoT online）${recent.length} 台；7日+无上报且 IoT 离线 ${staleAll.length} 台`)
    console.error(`   JSON: ${jsonPath}`)
    console.error(`   MD:   ${mdPath}`)
  } finally {
    await client.close().catch(() => undefined)
  }
}

function renderMarkdown(
  all: Enriched[],
  recent: Enriched[],
  stale: Enriched[],
  never: Enriched[],
  collection: string,
): string {
  const ts = new Date().toISOString()
  const line = (e: Enriched) =>
    `- \`${e.sn}\`  |  DeviceID: \`${e.deviceId}\`  |  ${e.nickname || '—'}  | IoT: ${e.online ? '在线✅' : '离线⚪'}  | 活跃来源: ${e.activitySource}  | 末次上报: ${e.lastReportedAt ? e.lastReportedAt + ` (${e.daysSinceReport}d前)` : '**从未上报**'}`
  return [
    '# 真实设备 7 日活跃分析（Mongo 遥测 + IoT 实时）',
    '',
    `> 生成时间：${ts}  `,
    `> 遥测集合：\`${collection}\`（只读聚合，未写/改 Mongo）  `,
    '> 口径：Mongo 末次上报在 7 日窗口内，或 IoT 当前 online=true，任一成立即计为活跃。',
    '',
    '## 汇总',
    '',
    `- 注册设备总数：**${all.length}**`,
    `- **近 7 日活跃**（Mongo 上报或 IoT online）：**${recent.length}** 台`,
    `- **近 7 日以上无上报且 IoT 离线**（疑似出厂测试注册、售出后未上线）：**${stale.length + never.length}** 台`,
    `  - 其中末次上报 > 7 天：${stale.length} 台`,
    `  - 其中**从未上报**：${never.length} 台`,
    '',
    '## 🟢 近 7 日活跃（' + recent.length + ' 台，需关注）',
    '',
    recent.length ? recent.map(line).join('\n') : '（无）',
    '',
    '## 🔴 近 7 日以上无上报（' + (stale.length + never.length) + ' 台，疑似出厂测试/未上线）',
    '',
    [...stale, ...never].map(line).join('\n'),
    '',
    '---',
    '',
    '说明：本分析基于 Mongo 遥测只读拉取，未修改任何 Mongo 配置或数据。如需把结果写回 SQLite（lastReportedAt）以驱动页面 7 日判定，需另行同步。',
    '',
  ].join('\n')
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
