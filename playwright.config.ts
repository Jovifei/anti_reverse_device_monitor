import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3101',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3101',
    url: 'http://127.0.0.1:3101',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      APP_DATABASE_URL: 'file:../data/e2e-ui-acceptance.db',
      APP_TIMEZONE: 'Asia/Shanghai'
    }
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
})
