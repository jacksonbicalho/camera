import { test, expect, type Page } from '@playwright/test'
import { LoginPage } from '../pages/LoginPage'

// CA4 — história feat/badge-cards-responsivo
// (work_progress/stories/202608040007_badge-cards-responsivo.md). Depende de
// CSS real (flex-wrap + breakpoint sm:) — jsdom não computa layout/wrap, só
// e2e prova que os 3 elementos ficam na mesma linha (ver "Testes funcionais"
// em docs/workflow.md, mesmo critério já usado em mobile-nav.spec.ts).
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin'
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? 'e2e-password-123'

async function login(page: Page) {
  const loginPage = new LoginPage(page)
  await loginPage.goto()
  await loginPage.login(ADMIN_USER, ADMIN_PASS)
  await expect(page).not.toHaveURL(/\/login$/)
}

test.describe('CA4: header do Ao vivo — título + preset + editar grid na mesma linha no mobile', () => {
  test.describe('viewport mobile (375x812)', () => {
    test.use({ viewport: { width: 375, height: 812 } })

    test('título, live-view-preset-trigger e live-view-edit-toggle ficam na mesma linha', async ({
      page,
    }) => {
      await login(page)
      await expect(page).toHaveURL('/')

      const title = page.locator('#live-view-content h2')
      const preset = page.locator('#live-view-preset-trigger')
      const editToggle = page.locator('#live-view-edit-toggle')

      await expect(title).toBeVisible()
      await expect(preset).toBeVisible()
      await expect(editToggle).toBeVisible()

      const titleBox = await title.boundingBox()
      const presetBox = await preset.boundingBox()
      const editBox = await editToggle.boundingBox()
      if (!titleBox || !presetBox || !editBox) {
        throw new Error('bounding box ausente para título/preset/editar grid')
      }

      // "mesma linha": os centros verticais dos 3 elementos ficam próximos — se
      // algum tivesse quebrado pra uma linha abaixo (comportamento antigo, um
      // PageHeader com actions full-width no mobile), o centro y divergiria por
      // pelo menos a altura de uma linha inteira (bem mais que essa tolerância).
      const titleMidY = titleBox.y + titleBox.height / 2
      const presetMidY = presetBox.y + presetBox.height / 2
      const editMidY = editBox.y + editBox.height / 2

      expect(Math.abs(presetMidY - titleMidY)).toBeLessThan(20)
      expect(Math.abs(editMidY - titleMidY)).toBeLessThan(20)

      // preset+editToggle não podem vazar pra fora da viewport (375px) — se o
      // texto completo ("3×3"/"Editar grid") não coubesse ao lado do título,
      // isso indicaria que o modo compacto (ícone-only) não está ativo.
      expect(editBox.x + editBox.width).toBeLessThanOrEqual(375)

      // modo compacto: o texto (`hidden sm:inline`) não é visível no mobile,
      // só o ícone — é o que libera espaço pra caber ao lado do título.
      await expect(page.locator('#live-view-edit-toggle span')).not.toBeVisible()
    })
  })

  test.describe('viewport desktop (1280x800)', () => {
    test.use({ viewport: { width: 1280, height: 800 } })

    test('preset e editar grid mostram o texto completo (span não fica hidden)', async ({
      page,
    }) => {
      await login(page)
      await expect(page).toHaveURL('/')

      // O texto some via `hidden sm:inline` (display:none), não sai do DOM — por
      // isso a checagem é de visibilidade do <span>, não de presença de texto
      // (textContent enxergaria o texto mesmo escondido por CSS).
      await expect(page.locator('#live-view-preset-trigger span')).toBeVisible()
      await expect(page.locator('#live-view-edit-toggle span')).toHaveText('Editar grid')
      await expect(page.locator('#live-view-edit-toggle span')).toBeVisible()
    })
  })
})
