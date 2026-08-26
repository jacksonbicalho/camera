import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/LoginPage'
import { HistoryPage } from '../pages/HistoryPage'

// Ids/credenciais do fixture semeado por e2e/seed (via scripts/e2e.sh) — os
// fallbacks batem com os valores fixos gerados pelo seed (e2e/seed/main.go),
// mesmo padrão de smoke.spec.ts.
const CAMERA_ID = process.env.E2E_CAMERA_ID ?? 'e2e00000-0000-4000-8000-000000000001'
const RECORDING_ID = process.env.E2E_RECORDING_ID ?? '1'
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin'
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? 'e2e-password-123'

test.beforeEach(async ({ page }) => {
  const login = new LoginPage(page)
  await login.goto()
  await login.login(ADMIN_USER, ADMIN_PASS)
  await expect(page).not.toHaveURL(/\/login$/)
})

// história fix/historytimeline-scroll-vazamento-janela: HistoryTimeline.tsx
// chamava activeLineRef.scrollIntoView({block:'nearest', ...}) num
// container com overflow-y:hidden (só rolável na horizontal, de propósito)
// — como esse eixo não é satisfazível ali, o browser escalava a busca até
// a window, rolando a página inteira a cada clique manual numa gravação.
// Medido com Playwright real numa instância isolada (não dava pra provar
// isso com teste de componente/jsdom, que não simula scroll/layout real
// entre ancestrais — daí ser e2e).
test('histórico: clicar numa gravação da lista não rola a janela', async ({ page }) => {
  const history = new HistoryPage(page)
  await history.goto(CAMERA_ID, RECORDING_ID)
  await expect(history.recordingItem(RECORDING_ID)).toHaveAttribute('aria-current', 'true', {
    timeout: 15_000,
  })

  await page.evaluate(() => window.scrollTo(0, 0))
  const before = await page.evaluate(() => window.scrollY)

  // Qualquer gravação da lista diferente da que já está ativa.
  const otherRecording = page
    .locator(
      `#history-recordings-groups button[id^="history-recording-"]:not(#history-recording-${RECORDING_ID})`,
    )
    .first()
  await otherRecording.click()
  await expect(otherRecording).toHaveAttribute('aria-current', 'true', { timeout: 15_000 })

  // A régua/lista podem rolar `smooth` internamente — dá tempo da animação
  // terminar antes de conferir que a JANELA não se moveu.
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => window.scrollY)
  expect(after).toBe(before)
})
