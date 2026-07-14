import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/LoginPage'
import { LivePage } from '../pages/LivePage'
import { Sidebar } from '../pages/Sidebar'

// Fallbacks batem com os valores fixos gerados pelo seed (e2e/seed/main.go) —
// mesma convenção do smoke.spec.ts.
const CAMERA_ID = process.env.E2E_CAMERA_ID ?? 'e2e00000-0000-4000-8000-000000000001'
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
  await sidebar.openSettingsFlyout()
  // "Usuários" é exclusivo de ADMIN_SETTINGS_LINKS (settingsNavLinks.ts) — um
  // viewer nunca deve ver essa seção no flyout de Configurações.
  await expect(sidebar.settingsLink('/settings/users')).toHaveCount(0)
  // Controle: "Câmeras" está em ambas as listas — confirma que o flyout
  // renderizou de verdade (não é uma ausência por o painel nunca ter aberto).
  await expect(sidebar.settingsLink('/settings/cameras')).toBeVisible()
})
