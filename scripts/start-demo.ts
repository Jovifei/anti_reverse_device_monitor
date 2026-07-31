import { spawn } from 'node:child_process'
import path from 'node:path'

const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
const child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', '3100'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    APP_DATABASE_URL: 'file:../data/demo-device-monitor.db',
    APP_TIMEZONE: 'Asia/Shanghai'
  }
})

child.once('exit', (code) => process.exit(code ?? 0))
child.once('error', (error) => {
  console.error('无法启动本地 Demo 服务：', error)
  process.exitCode = 1
})
