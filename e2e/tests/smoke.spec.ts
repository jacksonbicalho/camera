import { test, expect } from '@playwright/test'

// Ids/credenciais do fixture semeado por e2e/seed (via scripts/e2e.sh) — os
// fallbacks batem com os valores fixos gerados pelo seed (e2e/seed/main.go),
// pra rodar os specs fora do compose (servidor semeado à mão) também funcionar.
const CAMERA_ID = process.env.E2E_CAMERA_ID ?? 'e2e00000-0000-4000-8000-000000000001'
const RECORDING_ID = process.env.E2E_RECORDING_ID ?? '1'
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin'
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? 'e2e-password-123'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('#login-username', ADMIN_USER)
  await page.fill('#login-password', ADMIN_PASS)
  await page.click('#login-submit')
  // O redirect só acontece depois do fetch de login resolver — a URL sair de
  // /login é o sinal confiável de que o token já foi persistido.
  await expect(page).not.toHaveURL(/\/login$/)
})

test('ao vivo: player da câmera do fixture monta', async ({ page }) => {
  await page.goto(`/live/${CAMERA_ID}`)
  // O fixture não tem fonte RTSP real (rtsp://fixture/stream é falsa), então
  // o stream nunca conecta de fato — o objetivo aqui é só confirmar que o
  // componente de player monta pra uma câmera válida.
  await expect(page.locator('#live-player-video')).toBeAttached({ timeout: 15_000 })
})

test('histórico: gravação semeada é selecionada e carrega no player', async ({ page }) => {
  await page.goto(`/history/${CAMERA_ID}/${RECORDING_ID}`)

  await expect(page.locator(`#history-recording-${RECORDING_ID}`)).toHaveAttribute(
    'aria-current',
    'true',
    { timeout: 15_000 },
  )

  // VideoPlayer alterna entre dois <video> (double-buffering) — só o ativo
  // recebe src apontando pra /recordings/... (HistoryPage/RecordingsGateway).
  await expect(page.locator('#history-player video[src*="/recordings/"]')).toHaveCount(1, {
    timeout: 15_000,
  })
})
