import { defineConfig, devices, type ScreenshotMode, type VideoMode } from '@playwright/test'

// baseURL vem do orquestrador (scripts/e2e.sh, via e2e/docker-compose.yml),
// que sobe o servidor já semeado. Sem `webServer` aqui: o boot do servidor
// exige build Go + seed antes de ficar pronto — orquestrado fora do
// Playwright, não por ele.
//
// reporter/screenshot/video são configuráveis via env (E2E_REPORTER/
// E2E_SCREENSHOT/E2E_VIDEO) — útil pra depurar uma falha localmente (ex:
// `E2E_VIDEO=on E2E_REPORTER=html bash scripts/e2e.sh`) sem editar este
// arquivo. Defaults iguais ao comportamento de antes.
//
// E2E_PDF_REPORT=on acrescenta o reporter customizado de PDF (aditivo, não
// substitui E2E_REPORTER) — ver reporters/pdf-reporter.ts.
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    [process.env.E2E_REPORTER ?? 'list'],
    ...(process.env.E2E_PDF_REPORT === 'on' ? [['./reporters/pdf-reporter.ts'] as const] : []),
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8099',
    trace: 'on-first-retry',
    screenshot: (process.env.E2E_SCREENSHOT as ScreenshotMode | undefined) ?? 'only-on-failure',
    video: (process.env.E2E_VIDEO as VideoMode | undefined) ?? 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
