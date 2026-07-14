import { defineConfig, devices } from '@playwright/test'

// baseURL vem do orquestrador (scripts/e2e.sh, via e2e/docker-compose.yml),
// que sobe o servidor já semeado. Sem `webServer` aqui: o boot do servidor
// exige build Go + seed antes de ficar pronto — orquestrado fora do
// Playwright, não por ele.
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
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
