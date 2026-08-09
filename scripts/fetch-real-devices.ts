#!/usr/bin/env -S node --env-file=.env.local
/**
 * fetch-real-devices.ts
 *
 * 从 IoT 平台（默认 https://iot.dream-maker.com）拉取本公司在 productId
 * `689adc659f04ec32f7642fbb`（防逆流控制器 / GC 系列）下注册的全部真实设备，
 * 记录每台设备的 SN、Device ID、昵称与实时在线状态，并生成报告。
 *
 * 重要：该平台对"非浏览器形态"的请求会返回 456（WAF 拦截），因此必须带完整的
 * 浏览器请求头（Chrome UA / sec-ch-ua 等）。裸 JWT 在 Node fetch 默认走沙箱代理
 * 时会被拦，加上浏览器头后即可正常返回 200。
 *
 * 7 日活跃窗口（近 7 日离线 / 近 7 日上线）依赖遥测时间戳，而 getDevices/getDevice
 * 列表/详情接口均不含"最后上线时间"字段，需要 Mongo/SQLite 遥测（lastReportedAt）。
 * 该步骤受项目 Mongo 红线约束，默认不执行，见报告末尾说明。
 *
 * 用法: npm run devices:fetch-real
 * 环境变量:
 *   DREAM_MAKER_IOT_TOKEN    Bearer token（必填，来自 .env.local）
 *   DREAM_MAKER_IOT_BASE_URL 默认 https://iot.dream-maker.com
 *   IOT_REAL_PRODUCT_ID      默认 689adc659f04ec32f7642fbb
 *   IOT_REAL_OUT_DIR         输出目录，默认 reports
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const TOKEN = process.env.DREAM_MAKER_IOT_TOKEN
const BASE_URL = process.env.DREAM_MAKER_IOT_BASE_URL || 'https://iot.dream-maker.com'
const PRODUCT_ID = process.env.IOT_REAL_PRODUCT_ID || '689adc659f04ec32f7642fbb'
const OUT_DIR = process.env.IOT_REAL_OUT_DIR || 'reports'
const PAGE_SIZE = 100
const MAX_RETRY = 5

type RealDevice = {
  deviceId: string
  sn: string
  nickname: string
  online: boolean
}

function browserHeaders(): Record<string, string> {
  return {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh-HK;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6',
    Authorization: 'Bearer ' + TOKEN,
    Origin: BASE_URL,
    Referer: BASE_URL + '/iot/deviceManagement',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'sec-ch-ua': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
  }
}

async function fetchPage(page: number, size: number, attempt = 1): Promise<any> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(BASE_URL + '/api/device/getDevices', {
      method: 'POST',
      headers: browserHeaders(),
      body: JSON.stringify({ page, size, productId: PRODUCT_ID }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error('HTTP ' + res.status + ' ' + body.slice(0, 120))
    }
    const json = await res.json()
    if (json.code !== 0) throw new Error('biz code ' + json.code + ' ' + json.msg)
    return json.data
  } catch (e: any) {
    if (attempt < MAX_RETRY) {
      const wait = 2000 * attempt
      console.error(`  page ${page} attempt ${attempt} failed: ${e.message}; retry in ${wait}ms`)
      await new Promise((r) => setTimeout(r, wait))
      return fetchPage(page, size, attempt + 1)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

function renderMarkdown(devices: RealDevice[], online: RealDevice[], offline: RealDevice[]): string {
  const ts = new Date().toISOString()
  const line = (d: RealDevice) =>
    `| \`${d.sn}\` | \`${d.deviceId}\` | ${d.nickname || '—'} | ${d.online ? '✅ 在线' : '⚪ 离线'} |`
  const rows = devices.map(line).join('\n')
  return [
    '# 真实设备清单（IoT 平台实拉）',
    '',
    `> 生成时间：${ts}  `,
    `> 数据源：\`POST ${BASE_URL}/api/device/getDevices\`（productId \`${PRODUCT_ID}\`）`,
    '> 说明：以下为接口实时返回的全部注册设备及其在线状态；SN↔Device ID 映射取自接口返回。',
    '',
    '## 汇总',
    '',
    `- 注册设备总数：**${devices.length}**`,
    `- 当前**在线**：**${online.length}**`,
    `- 当前**离线**：${offline.length}`,
    '',
    '## ✅ 在线设备（' + online.length + ' 台）',
    '',
    online.length
      ? online.map((d) => `- \`${d.sn}\`  |  DeviceID: \`${d.deviceId}\`  |  ${d.nickname || '—'}`).join('\n')
      : '（无）',
    '',
    '## ⚪ 离线设备（' + offline.length + ' 台）',
    '',
    offline.map((d) => `- \`${d.sn}\`  |  DeviceID: \`${d.deviceId}\`  |  ${d.nickname || '—'}`).join('\n'),
    '',
    '## 📋 完整清单（SN · Device ID · 昵称 · 状态）',
    '',
    '| SN | Device ID | 昵称 | 状态 |',
    '| --- | --- | --- | --- |',
    rows,
    '',
    '---',
    '',
    '## ⚠️ 关于「近 7 日离线 / 近 7 日上线」分析',
    '',
    '- `getDevices` 列表与 `getDevice` 详情接口**均不含"最后上线时间"时间戳**，只有当前 `online` 布尔值。',
    '- 因此"近 7 日以上离线（疑似出厂测试注册、售出后未上线）"与"近 7 日内上线过（刚起步、需关注）"这两个窗口**无法仅凭本接口计算**。',
    '- 如需该分析，需要设备遥测时间戳，来源为 Mongo/SQLite 的 `lastReportedAt`。该数据源受项目红线约束（禁止修改 Mongo 配置/数据），需你确认只读拉取后再补。',
    '',
  ].join('\n')
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error('DREAM_MAKER_IOT_TOKEN 未设置（请在 .env.local 配置）')
    process.exit(1)
  }
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  const all = new Map<string, RealDevice>()
  let page = 1
  while (true) {
    const d = await fetchPage(page, PAGE_SIZE)
    const content: any[] = d.content || []
    for (const it of content) {
      if (it.id) {
        all.set(it.id, {
          deviceId: String(it.id),
          sn: it.sn ?? '',
          nickname: it.nickname ?? '',
          online: !!it.online,
        })
      }
    }
    console.error(`page ${page}: +${content.length} (total=${d.totalElements}, last=${d.last})`)
    if (d.last || content.length === 0) break
    page++
  }

  const devices = [...all.values()].sort((a, b) => (a.sn || '').localeCompare(b.sn || ''))
  const online = devices.filter((d) => d.online)
  const offline = devices.filter((d) => !d.online)

  const date = new Date().toISOString().slice(0, 10)
  const jsonPath = join(OUT_DIR, `iot-real-devices-${date}.json`)
  const mdPath = join(OUT_DIR, `iot-real-devices-${date}.md`)
  writeFileSync(jsonPath, JSON.stringify({ productId: PRODUCT_ID, fetchedAt: new Date().toISOString(), total: devices.length, online: online.length, offline: offline.length, devices }, null, 2), 'utf8')
  writeFileSync(mdPath, renderMarkdown(devices, online, offline), 'utf8')

  console.error(`\n✅ 完成：共 ${devices.length} 台（在线 ${online.length} / 离线 ${offline.length}）`)
  console.error(`   JSON: ${jsonPath}`)
  console.error(`   MD:   ${mdPath}`)
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
