import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/LoginPage'
import { LivePage } from '../pages/LivePage'
import { HistoryPage } from '../pages/HistoryPage'

// Ids/credenciais do fixture semeado por e2e/seed (via scripts/e2e.sh) — os
// fallbacks batem com os valores fixos gerados pelo seed (e2e/seed/main.go),
// pra rodar os specs fora do compose (servidor semeado à mão) também funcionar.
const CAMERA_ID = process.env.E2E_CAMERA_ID ?? 'e2e00000-0000-4000-8000-000000000001'
const RECORDING_ID = process.env.E2E_RECORDING_ID ?? '1'
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin'
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? 'e2e-password-123'

test.beforeEach(async ({ page }) => {
  const login = new LoginPage(page)
  await login.goto()
  await login.login(ADMIN_USER, ADMIN_PASS)
  // O redirect só acontece depois do fetch de login resolver — a URL sair de
  // /login é o sinal confiável de que o token já foi persistido.
  await expect(page).not.toHaveURL(/\/login$/)
})

test('ao vivo: player da câmera do fixture monta', async ({ page }) => {
  const live = new LivePage(page)
  await live.goto(CAMERA_ID)
  // O fixture não tem fonte RTSP real (rtsp://fixture/stream é falsa), então
  // o stream nunca conecta de fato — o objetivo aqui é só confirmar que o
  // componente de player monta pra uma câmera válida.
  await expect(live.video).toBeAttached({ timeout: 15_000 })
})

test('histórico: gravação semeada é selecionada e carrega no player', async ({ page }) => {
  const history = new HistoryPage(page)
  await history.goto(CAMERA_ID, RECORDING_ID)

  await expect(history.recordingItem(RECORDING_ID)).toHaveAttribute('aria-current', 'true', {
    timeout: 15_000,
  })
  await expect(history.activeVideos()).toHaveCount(1, { timeout: 15_000 })
})
