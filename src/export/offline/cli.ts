import type { ExportCliOptions } from '@/src/export/offline/types'

function takeValue(argv: string[], index: number) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`参数 ${argv[index]} 缺少值`)
  return value
}

export function printExportHelp() {
  return `用法:
  npm run export:html -- [选项]
  npm run export:html:demo
  npm run export:html:excel -- <excel路径> [--sn SN]

选项:
  --sn <SN>           导出指定设备
  --all               导出库中全部活跃设备
  --days <n>          最近天数，默认 7
  --db <path>         SQLite 文件路径（设置 APP_DATABASE_URL）
  --excel <path>      从 Excel 经临时库导出
  --demo              Demo 模式产物命名
  --single-file       生成自包含单文件 HTML
  --bundle            生成多设备 Bundle + ZIP
  --out <dir>         输出目录，默认 artifacts/offline-ui
  --title <text>      页面标题前缀
  --help              显示帮助
`
}

export function parseExportArgs(argv: string[]): ExportCliOptions {
  const options: ExportCliOptions = {
    days: 7,
    out: 'artifacts/offline-ui',
    singleFile: false,
    bundle: false
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true
        break
      case '--sn':
        options.sn = takeValue(argv, i)
        i += 1
        break
      case '--all':
        options.all = true
        break
      case '--days':
        options.days = Number(takeValue(argv, i))
        i += 1
        break
      case '--db':
        options.db = takeValue(argv, i)
        i += 1
        break
      case '--excel':
        options.excel = takeValue(argv, i)
        i += 1
        break
      case '--demo':
        options.demo = true
        options.all = true
        break
      case '--single-file':
        options.singleFile = true
        break
      case '--bundle':
        options.bundle = true
        break
      case '--out':
        options.out = takeValue(argv, i)
        i += 1
        break
      case '--title':
        options.title = takeValue(argv, i)
        i += 1
        break
      default:
        if (arg.startsWith('--')) throw new Error(`未知参数: ${arg}`)
        // positional excel path for export:html:excel convenience
        if (!options.excel && arg.toLowerCase().endsWith('.xlsx')) options.excel = arg
        else if (!options.excel && arg.toLowerCase().endsWith('.xls')) options.excel = arg
        else throw new Error(`无法识别参数: ${arg}`)
    }
  }

  if (options.help) return options
  if (!Number.isFinite(options.days) || options.days < 1 || options.days > 30) {
    throw new Error('--days 必须是 1～30 的整数')
  }
  if (!options.singleFile && !options.bundle) {
    throw new Error('请指定 --single-file 和/或 --bundle')
  }
  if (!options.sn && !options.all && !options.demo) {
    throw new Error('请指定 --sn 或 --all（Demo 可用 --demo）')
  }
  if (options.sn && options.all && !options.demo) {
    throw new Error('--sn 与 --all 不能同时使用')
  }
  return options
}
