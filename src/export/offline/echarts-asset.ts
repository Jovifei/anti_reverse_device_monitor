import fs from 'node:fs'
import path from 'node:path'

export function loadEchartsMinJs(root = process.cwd()): string {
  const candidate = path.join(root, 'node_modules', 'echarts', 'dist', 'echarts.min.js')
  if (!fs.existsSync(candidate)) {
    throw new Error(`未找到 ECharts 资源: ${candidate}`)
  }
  return fs.readFileSync(candidate, 'utf8')
}
