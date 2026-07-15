import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

// Reporter customizado que gera e2e/playwright-report/report.pdf — habilitado
// via E2E_PDF_REPORT=on (ver playwright.config.ts). Existe porque o relatório
// HTML oficial do Playwright é uma SPA com testes colapsados e screenshots
// atrás de lazy-load: imprimir a página direto (Ctrl+P/page.pdf()) captura só
// a lista resumida, sem detalhes nem imagens. Aqui montamos um HTML "plano" —
// já expandido, com cada screenshot embutido inline como data URI — e
// imprimimos ESSE HTML, garantindo que o PDF final carregue os dados/imagens
// no próprio arquivo (nunca uma referência externa a playwright-report/data/).

interface CollectedTest {
  title: string
  status: string
  duration: number
  errors: string[]
  screenshots: string[]
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Playwright colore o diff de expect()/toEqual() com códigos ANSI em
// error.message/.stack — sem remover, o PDF mostra sequências de escape
// cruas ([32m...) em vez de texto legível.
function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;]*m/g, '')
}

function statusColor(status: string): string {
  if (status === 'passed') return '#0a7d2c'
  if (status === 'failed' || status === 'timedOut') return '#b3261e'
  return '#8a6d00'
}

export default class PDFReporter implements Reporter {
  private readonly outputDir = 'playwright-report'
  private readonly tests: CollectedTest[] = []

  onTestEnd(test: TestCase, result: TestResult): void {
    const screenshots = result.attachments
      .filter((attachment) => attachment.name === 'screenshot' && attachment.path)
      .filter((attachment) => fs.existsSync(attachment.path as string))
      .map((attachment) => {
        const bytes = fs.readFileSync(attachment.path as string)
        return `data:image/png;base64,${bytes.toString('base64')}`
      })

    this.tests.push({
      title: test.titlePath().slice(1).join(' › '),
      status: result.status,
      duration: result.duration,
      errors: result.errors.map((error) => stripAnsi(error.stack ?? error.message ?? String(error))),
      screenshots,
    })
  }

  async onEnd(): Promise<void> {
    fs.mkdirSync(this.outputDir, { recursive: true })
    const outPath = path.join(this.outputDir, 'report.pdf')

    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.setContent(this.buildHtml())
      await page.pdf({ path: outPath, format: 'A4', printBackground: true })
    } finally {
      await browser.close()
    }
  }

  private buildHtml(): string {
    const sections = this.tests.map((test) => this.buildTestSection(test)).join('\n')

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Playwright Test Report (PDF)</title>
<style>
  body { font-family: Arial, sans-serif; margin: 24px; color: #1a1a1a; }
  h1 { font-size: 20px; }
  section.test { page-break-after: always; padding-bottom: 16px; }
  h2 { font-size: 15px; margin-bottom: 4px; }
  .status { font-weight: bold; margin-left: 8px; }
  .meta { color: #666; font-size: 12px; margin: 0 0 12px; }
  pre.error {
    background: #fdecea;
    padding: 8px;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    font-size: 11px;
  }
  img.screenshot { max-width: 100%; border: 1px solid #ccc; margin-top: 8px; display: block; }
</style>
</head>
<body>
<h1>Relatório e2e (PDF) — ${this.tests.length} teste(s)</h1>
${sections}
</body>
</html>`
  }

  private buildTestSection(test: CollectedTest): string {
    const errors = test.errors.length
      ? `<pre class="error">${escapeHtml(test.errors.join('\n\n'))}</pre>`
      : ''
    const images = test.screenshots
      .map((src) => `<img class="screenshot" src="${src}" />`)
      .join('\n')

    return `<section class="test">
  <h2>${escapeHtml(test.title)}<span class="status" style="color:${statusColor(test.status)}">${test.status.toUpperCase()}</span></h2>
  <p class="meta">${test.duration}ms</p>
  ${errors}
  ${images}
</section>`
  }
}
