import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/LoginPage'
import { LivePage } from '../pages/LivePage'
import { Sidebar } from '../pages/Sidebar'

// Fallbacks batem com os valores fixos gerados pelo seed (e2e/seed/main.go) —
// mesma convenção do smoke.spec.ts.
const CAMERA_ID = process.env.E2E_CAMERA_ID ?? 'e2e00000-0000-4000-8000-000000000001'
// 2ª câmera do fixture, nunca concedida ao viewer (db.SetUserCameras só
// inclui CAMERA_ID) — usada só pelo cenário negativo abaixo.
const ADMIN_ONLY_CAMERA_ID =
  process.env.E2E_ADMIN_ONLY_CAMERA_ID ?? 'e2e00000-0000-4000-8000-000000000002'
const VIEWER_USER = process.env.E2E_VIEWER_USER ?? 'viewer'
const VIEWER_PASS = process.env.E2E_VIEWER_PASS ?? 'e2e-viewer-password-123'

test.beforeEach(async ({ page }) => {
  const login = new LoginPage(page)
  await login.goto()
  await login.login(VIEWER_USER, VIEWER_PASS)
  await expect(page).not.toHaveURL(/\/login$/)
})

test('viewer: acessa a câmera concedida, sem seções admin-only', async ({ page }) => {
  const live = new LivePage(page)
  await live.goto(CAMERA_ID)
  // Mesmo sujeito ao fixture sem RTSP real (ver smoke.spec.ts) — o objetivo é
  // confirmar que o acesso concedido (SetUserCameras no seed) deixa o viewer
  // montar o player da própria câmera, não que o stream reproduz de fato.
  await expect(live.video).toBeAttached({ timeout: 15_000 })

  const sidebar = new Sidebar(page)

  // Controle: "Câmeras" (seção "Sistema", sempre visível) confirma que o
  // rail renderizou de verdade (não é uma ausência por algo não ter
  // montado).
  await expect(sidebar.settingsLink('/settings/cameras')).toBeVisible()

  // "Usuários" vive na seção "Administração" (Sidebar.tsx), que só existe
  // pra admin — a seção inteira some pro viewer, não só o link.
  await expect(sidebar.settingsLink('/settings/users')).toHaveCount(0)
})

test('viewer: não acessa uma câmera concedida só ao admin', async ({ page }) => {
  const live = new LivePage(page)
  await live.goto(ADMIN_ONLY_CAMERA_ID)
  // GET /api/cameras (authFull) já filtra a lista pelo usuário — pra um
  // viewer sem acesso, a câmera simplesmente não está no array devolvido,
  // então LivePage trata como "não encontrada" (mesmo caminho de uma câmera
  // inexistente) e não monta player nenhum: ver
  // frontend/src/pages/LivePage.tsx e LivePage.test.tsx.
  await expect(live.error).toBeVisible({ timeout: 15_000 })
  await expect(live.video).not.toBeAttached()
})
