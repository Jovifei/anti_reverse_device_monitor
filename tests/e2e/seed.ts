import { execFileSync } from 'node:child_process'

const command = process.platform === 'win32'
  ? { file: 'cmd.exe', args: ['/d', '/s', '/c', 'npx tsx scripts/seed-demo.ts'] }
  : { file: 'npx', args: ['tsx', 'scripts/seed-demo.ts'] }

execFileSync(command.file, command.args, {
  cwd: process.cwd(),
  env: { ...process.env, DEMO_DATABASE_FILE: 'e2e-ui-acceptance.db' },
  stdio: 'inherit'
})
