import { test, expect, type Page } from '@playwright/test'
import { LoginPage } from '../pages/LoginPage'
import { Sidebar } from '../pages/Sidebar'

// CA3 — a decisão de navegação mobile (história feat/mobile-layout-responsivo,
// análise em work_progress/analysis/202608010004_mobile-layout-responsivo.md):
// drawer off-canvas abaixo de `lg`, rail persistente em `lg`+. Depende de CSS
// real (media query `lg:`), então não é verificável via teste de componente
// (jsdom não avalia `@media` — ver "Testes funcionais" no CLAUDE.md) — só e2e.
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin'
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? 'e2e-password-123'

async function login(page: Page) {
  const loginPage = new LoginPage(page)
  await loginPage.goto()
  await loginPage.login(ADMIN_USER, ADMIN_PASS)
  await expect(page).not.toHaveURL(/\/login$/)
}

test.describe('CA3: navegação mobile — drawer abaixo de lg, rail persistente em lg+', () => {
  test.describe('viewport mobile (375x812)', () => {
    test.use({ viewport: { width: 375, height: 812 } })

    test('rail começa oculto; hamburguer abre o drawer com backdrop; backdrop fecha', async ({
      page,
    }) => {
      await login(page)
      const sidebar = new Sidebar(page)

      await expect(sidebar.mobileNavToggle).toBeVisible()
      // O rail fechado usa `-translate-x-full` (desliza pra fora da viewport) — ainda
      // "visible" no sentido do Playwright (display/visibility/opacity), já que o CSS
      // não usa `hidden`/`invisible`; a checagem correta é geométrica: fora da área
      // visível da página.
      await expect(sidebar.rail).not.toBeInViewport()
      await expect(sidebar.backdrop).toHaveCount(0)

      await sidebar.mobileNavToggle.click()
      await expect(sidebar.backdrop).toBeVisible()
      await expect(sidebar.rail).toBeInViewport()

      // O backdrop cobre a viewport inteira (inset-0), mas o rail aberto (w-48
      // = 192px, z-30) fica por CIMA dele (z-20) nos primeiros 192px de
      // largura. Num viewport de 375px, o centro geométrico do backdrop
      // (~187px) cai bem em cima dessa borda — clique no centro (default do
      // Playwright) é uma corrida de sub-pixel entre cair dentro ou fora do
      // rail, foi isso que causou o timeout intermitente reportado no CI.
      // Clicar num ponto claramente à direita do rail (fora dos 192px) evita
      // a ambiguidade.
      await sidebar.backdrop.click({ position: { x: 350, y: 400 } })
      await expect(sidebar.backdrop).toHaveCount(0)
      await expect(sidebar.rail).not.toBeInViewport()
    })
  })

  test.describe('viewport desktop (1280x800)', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('rail sempre visível, sem hamburguer', async ({ page }) => {
      await login(page)
      const sidebar = new Sidebar(page)

      await expect(sidebar.rail).toBeVisible()
      await expect(sidebar.mobileNavToggle).not.toBeVisible()
    })
  })
})
