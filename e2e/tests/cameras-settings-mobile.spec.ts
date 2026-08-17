import { test, expect, type Page } from '@playwright/test'
import { LoginPage } from '../pages/LoginPage'

// CA7 — história feat/badge-cards-responsivo
// (work_progress/stories/202608040007_badge-cards-responsivo.md), adaptado
// na história refactor/camera-list-cards: /settings/cameras trocou a linha
// horizontal por um CameraCard vertical (mesmo chrome de ExtensionCard) numa
// grade `flex-wrap` — nome/badges/ações já ficam em blocos empilhados por
// construção (não é mais uma quebra condicional de uma linha única), então
// o risco que resta no mobile é o card (e o bloco de ações dentro dele) não
// vazar da viewport estreita. A largura é FIXA (`w-full sm:w-md`, 448px a
// partir do breakpoint `sm`) — jsdom não computa layout real (nem o cálculo
// de `--container-md` do Tailwind, nem o wrap da grade), então só e2e prova
// as duas pontas: nada vaza no mobile (abaixo de `sm`, cai no `w-full`) E o
// card renderiza na largura fixa correta em telas maiores (achado do code
// review: a suíte só cobria o `w-full`, nunca o `sm:w-md` de fato — ver
// "Testes funcionais" em docs/workflow.md).
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin'
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? 'e2e-password-123'
const CAMERA_ID = process.env.E2E_CAMERA_ID ?? 'e2e00000-0000-4000-8000-000000000001'

async function login(page: Page) {
  const loginPage = new LoginPage(page)
  await loginPage.goto()
  await loginPage.login(ADMIN_USER, ADMIN_PASS)
  await expect(page).not.toHaveURL(/\/login$/)
}

test.describe('CA7: card de câmera em /settings/cameras não vaza da viewport no mobile', () => {
  test.describe('viewport mobile (375x812)', () => {
    test.use({ viewport: { width: 375, height: 812 } })

    test('nome, badges e ações (Configurar/Excluir) ficam visíveis e dentro da largura da tela', async ({
      page,
    }) => {
      await login(page)
      await page.goto('/settings/cameras')

      const card = page.locator(`#camera-card-${CAMERA_ID}`)
      await expect(card).toBeVisible()

      const name = card.getByText('E2E Cam', { exact: true })
      const configureBtn = card.getByRole('link', { name: /Configurar/i })
      const deleteBtn = card.getByRole('button', { name: /Excluir/i })

      await expect(name).toBeVisible()
      await expect(configureBtn).toBeVisible()
      await expect(deleteBtn).toBeVisible()

      // CameraCard é vertical (thumbnail/nome/badges/ações já empilhados por
      // construção, mesmo chrome de ExtensionCard) — o que resta a provar no
      // mobile é que nada vaza da viewport estreita (375px): nem o card
      // inteiro (max-w-md ~448px, mais largo que a viewport), nem o bloco de
      // ações dentro dele.
      const cardBox = await card.boundingBox()
      const configureBox = await configureBtn.boundingBox()
      const deleteBox = await deleteBtn.boundingBox()
      if (!cardBox || !configureBox || !deleteBox) {
        throw new Error('bounding box ausente para o card/Configurar/Excluir')
      }
      expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(375)
      expect(configureBox.x + configureBox.width).toBeLessThanOrEqual(375)
      expect(deleteBox.x + deleteBox.width).toBeLessThanOrEqual(375)
    })
  })

  test.describe('viewport desktop (1280x800)', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('card renderiza na largura fixa de 448px (mesma medida de ExtensionCard), não menor', async ({
      page,
    }) => {
      await login(page)
      await page.goto('/settings/cameras')

      const card = page.locator(`#camera-card-${CAMERA_ID}`)
      await expect(card).toBeVisible()

      const cardBox = await card.boundingBox()
      if (!cardBox) throw new Error('bounding box ausente para o card')
      expect(cardBox.width).toBeCloseTo(448, 0)
    })
  })
})
