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
  // "Usuários" vive no grupo "Configurações do Sistema" (settingsNavLinks.ts,
  // ADMIN_SETTINGS_GROUPS) — exclusivo de admin; um viewer nunca deve ver
  // essa seção no 2º flyout de Configurações.
  await sidebar.openConfiguracoesSistemaFlyout()
  await expect(sidebar.settingsLink('/settings/users')).toHaveCount(0)

  // Controle: "Câmeras" está no 1º flyout (grupo "Configurações"), em ambos
  // os papéis — confirma que os flyouts renderizam de verdade (não é uma
  // ausência por o painel nunca ter aberto).
  await sidebar.openConfiguracoesFlyout()
  await expect(sidebar.settingsLink('/settings/cameras')).toBeVisible()
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
