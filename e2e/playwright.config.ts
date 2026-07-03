import { defineConfig, devices } from '@playwright/test'

// baseURL e ids do fixture vêm do orquestrador (scripts/e2e.sh), que sobe o
// servidor contra um DB semeado. O harness não gerencia o servidor aqui
// (sem `webServer`) porque o boot precisa de build + seed em Go antes.
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8099',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
