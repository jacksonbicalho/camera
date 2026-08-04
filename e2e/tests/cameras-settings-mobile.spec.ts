import { test, expect, type Page } from '@playwright/test'
import { LoginPage } from '../pages/LoginPage'

// CA7 — história feat/badge-cards-responsivo
// (work_progress/stories/202608040007_badge-cards-responsivo.md). O card de
// cada câmera em /settings/cameras usa um único container `flex flex-wrap`
// pra nome/badges/ações quebrarem em linhas independentes no mobile (mesmo
// raciocínio do header do Ao vivo, CA4/T3) — jsdom não computa layout real,
// então só e2e prova a quebra (ver "Testes funcionais" em docs/workflow.md).
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin'
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? 'e2e-password-123'
const CAMERA_ID = process.env.E2E_CAMERA_ID ?? 'e2e00000-0000-4000-8000-000000000001'

async function login(page: Page) {
  const loginPage = new LoginPage(page)
  await loginPage.goto()
  await loginPage.login(ADMIN_USER, ADMIN_PASS)
  await expect(page).not.toHaveURL(/\/login$/)
}

test.describe('CA7: card de câmera em /settings/cameras quebra em linhas no mobile', () => {
  test.describe('viewport mobile (375x812)', () => {
    test.use({ viewport: { width: 375, height: 812 } })

    test('nome, badges e ações (Editar/Excluir) ficam em linhas distintas, sem vazar da viewport', async ({
      page,
    }) => {
      await login(page)
      await page.goto('/settings/cameras')

      const row = page.locator(`#camera-row-${CAMERA_ID}`)
      await expect(row).toBeVisible()

      const name = row.getByText('E2E Cam', { exact: true })
      const editBtn = row.getByRole('link', { name: /Editar/i })
      const deleteBtn = row.getByRole('button', { name: /Excluir/i })

      await expect(name).toBeVisible()
      await expect(editBtn).toBeVisible()
      await expect(deleteBtn).toBeVisible()

      const nameBox = await name.boundingBox()
      const editBox = await editBtn.boundingBox()
      if (!nameBox || !editBox) throw new Error('bounding box ausente para nome/Editar')

      // nome e ações não cabem lado a lado em 375px (thumbnail + nome + 2
      // badges + 2 botões com texto) — devem cair em linhas diferentes: o
      // topo do bloco de ações fica abaixo do topo do nome por mais que a
      // altura de uma linha (ao contrário do header do Ao vivo/CA4, aqui a
      // quebra É o comportamento esperado no mobile, não uma regressão).
      expect(editBox.y).toBeGreaterThan(nameBox.y + nameBox.height / 2)

      // nada vaza da viewport (375px) — nem o card inteiro, nem o bloco de ações.
      const rowBox = await row.boundingBox()
      const deleteBox = await deleteBtn.boundingBox()
      if (!rowBox || !deleteBox) throw new Error('bounding box ausente para o card/Excluir')
      expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(375)
      expect(editBox.x + editBox.width).toBeLessThanOrEqual(375)
      expect(deleteBox.x + deleteBox.width).toBeLessThanOrEqual(375)
    })
  })
})
