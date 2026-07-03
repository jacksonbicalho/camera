import { test, expect } from '@playwright/test'

// Ids do fixture semeado por scripts/e2e.sh (e2e/seed).
const CAMERA_ID = process.env.E2E_CAMERA_ID ?? ''
const RECORDING_ID = process.env.E2E_RECORDING_ID ?? ''
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin'
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? 'e2e-password-123'

test('login → abrir gravação → player e timeline renderizam', async ({ page }) => {
  // Login com a senha conhecida do fixture (admin já liberado, sem troca).
  await page.goto('/login')
  await page.fill('#login-username', ADMIN_USER)
  await page.fill('#login-password', ADMIN_PASS)
  await page.click('#login-submit')
  await expect(page).not.toHaveURL(/\/login$/)

  // Deep-link da gravação — exercita o caminho by-id (reprodução instantânea).
  await page.goto(`/camera/recording/${CAMERA_ID}/${RECORDING_ID}`)

  // Player: <video> recebe src derivado da gravação (/recordings/...).
  const video = page.locator('video').first()
  await expect(video).toHaveAttribute('src', /\/recordings\//, { timeout: 15_000 })

  // Timeline: a faixa de gravação renderiza como run (chunks contíguos fundidos).
  await expect(page.locator('[id^="timeline-run-"]').first()).toBeVisible({ timeout: 15_000 })
})
