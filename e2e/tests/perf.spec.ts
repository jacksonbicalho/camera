import { test, expect, type Page } from '@playwright/test'

// Ids do fixture em ESCALA (E2E_RECORDINGS grande) semeado pelo docker-compose.
const CAMERA_ID = process.env.E2E_CAMERA_ID ?? ''
const RECORDING_ID = process.env.E2E_RECORDING_ID ?? ''
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin'
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? 'e2e-password-123'

const RECORDING_URL = `/camera/recording/${CAMERA_ID}/${RECORDING_ID}`

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('#login-username', ADMIN_USER)
  await page.fill('#login-password', ADMIN_PASS)
  await page.click('#login-submit')
  await expect(page).not.toHaveURL(/\/login$/)
}

// História 3 — DOM enxuto: mesmo com milhares de gravações, o timeline funde os
// chunks contíguos em poucos runs e o filmstrip capa em 120. No código pré-História-3
// seriam ~N spans e ~N botões.
test('História 3: timeline e filmstrip têm DOM bounded (não ~N)', async ({ page }) => {
  await login(page)
  await page.goto(RECORDING_URL)

  await expect(page.locator('video').first()).toHaveAttribute('src', /\/recordings\//, { timeout: 20_000 })
  await expect(page.locator('[id^="filmstrip-"]').first()).toBeVisible({ timeout: 20_000 })

  const runs = await page.locator('[id^="timeline-run-"]').count()
  const thumbs = await page.locator('[id^="filmstrip-"]').count()
  console.log(`[perf] timeline runs=${runs} filmstrip thumbs=${thumbs}`)

  // Chunks contíguos ⇒ pouquíssimos runs (idealmente 1); cap do filmstrip = 120.
  expect(runs).toBeLessThanOrEqual(10)
  expect(thumbs).toBeLessThanOrEqual(120)
})

// História 1 — reprodução instantânea: atrasando a resposta da LISTA do dia em 3s,
// o <video src> ainda aparece rápido (< 1,5s), provando que a reprodução vem do
// by-id e NÃO espera a lista. No código antigo, o vídeo só surgiria após o atraso.
test('História 1: vídeo é independente da lista do dia (atraso injetado)', async ({ page }) => {
  await login(page)

  // Atrasa só a lista (/recordings?...), não o by-id (/recordings/by-id/...).
  await page.route(/\/recordings\?/, async route => {
    await new Promise(r => setTimeout(r, 3000))
    await route.continue()
  })

  const t0 = Date.now()
  await page.goto(RECORDING_URL)
  await expect(page.locator('video').first()).toHaveAttribute('src', /\/recordings\//, { timeout: 10_000 })
  const dt = Date.now() - t0
  console.log(`[perf] tempo até <video src> com lista atrasada 3s = ${dt}ms`)

  // Bem abaixo dos 3s de atraso da lista ⇒ não dependeu dela.
  expect(dt).toBeLessThan(1500)
})

// História 2 — poll da cauda: o poll periódico do dia de hoje busca só PAGE_SIZE (10),
// não a lista inteira (limit=0). Capturamos as requisições e exigimos ver um poll
// com limit=10 (o load inicial usa limit=0).
test('História 2: poll usa a cauda (limit=10), não a lista inteira', async ({ page }) => {
  await login(page)

  const limits: string[] = []
  page.on('request', req => {
    const u = req.url()
    if (!u.includes('/recordings?')) return
    const m = u.match(/[?&]limit=(\d+)/)
    if (m) limits.push(m[1])
  })

  await page.goto(RECORDING_URL)
  await expect(page.locator('video').first()).toHaveAttribute('src', /\/recordings\//, { timeout: 20_000 })
  // Aguarda ≥1 ciclo do poll (5s).
  await page.waitForTimeout(6500)

  console.log(`[perf] limits observados nas requisições de gravações: ${limits.join(',')}`)
  expect(limits).toContain('10')
})

// TTFF informativo — mede navigation→<video src> sem atraso e loga; teto só de
// sanidade (não gate apertado: timing é flaky em CI compartilhada).
test('TTFF: mede e loga o tempo até o primeiro src (sanidade)', async ({ page }) => {
  await login(page)
  const t0 = Date.now()
  await page.goto(RECORDING_URL)
  await expect(page.locator('video').first()).toHaveAttribute('src', /\/recordings\//, { timeout: 20_000 })
  const ttff = Date.now() - t0
  console.log(`[perf] TTFF (navigation→<video src>) = ${ttff}ms`)
  expect(ttff).toBeLessThan(8000)
})
