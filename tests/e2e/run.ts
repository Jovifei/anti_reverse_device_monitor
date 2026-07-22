import { execFileSync } from 'node:child_process'

process.env.PLAYWRIGHT_BROWSERS_PATH = 'E:\\Claude_allow\\Download\\playwright-browsers'

try {
  const command: { file: string; args: string[] } = process.platform === 'win32'
    ? { file: 'cmd.exe', args: ['/d', '/s', '/c', 'npx playwright test'] }
    : { file: 'npx', args: ['playwright', 'test'] }
  execFileSync(command.file, command.args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
} catch {
  process.exitCode = 1
}
