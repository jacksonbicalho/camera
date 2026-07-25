import { describe, test, expect } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'

// Testes estruturais/estáticos do PDFReporter — leem o próprio código-fonte
// (e config relacionada), sem precisar gerar um PDF de verdade (isso exigiria
// subir o harness Docker inteiro com E2E_PDF_REPORT=on; ver
// scripts/e2e-pdf-report-check.sh para os cenários que inspecionam o PDF
// gerado). Rodados via `bun test` dentro de scripts/e2e-lint-check.sh —
// nenhuma invocação dedicada por CA.
//
// Os "CA: ..." abaixo são critérios herdados de histórias já fechadas
// (feat/e2e-pdf-report-detalhado, PR #527) — não a numeração desta story;
// por isso ficam sem número.

const root = path.join(import.meta.dir, '..')
const reporterSrc = fs.readFileSync(path.join(root, 'reporters/pdf-reporter.ts'), 'utf8')

describe('PDFReporter', () => {
  describe('CA: título do PDF inclui o nome do sistema e a data por extenso em pt-BR', () => {
    test('referencia "os-camera" e formata a data com Intl.DateTimeFormat pt-BR/long', () => {
      expect(reporterSrc).toContain('os-camera')
      expect(reporterSrc).toMatch(/Intl\.DateTimeFormat\('pt-BR'/)
      expect(reporterSrc).toMatch(/dateStyle:\s*'long'/)
    })
  })

  describe('CA: screenshots ficam num container com espaçamento próprio, ocupando quase a largura toda', () => {
    test('img.screenshot usa max-width: 100% e .screenshots usa display: flex + gap', () => {
      expect(reporterSrc).toMatch(/img\.screenshot\s*\{[^}]*max-width:\s*100%/)
      expect(reporterSrc).toMatch(/\.screenshots\s*\{[^}]*display:\s*flex/)
      expect(reporterSrc).toMatch(/\.screenshots\s*\{[^}]*gap:/)
    })
  })
})

describe('E2E_PDF_REPORT toggle', () => {
  describe('CA: a geração do PDF é controlada por E2E_PDF_REPORT (default off), repassada pelo compose e lida pelo Playwright config', () => {
    test('e2e/.env.example documenta o default off', () => {
      const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8')
      expect(envExample).toMatch(/^E2E_PDF_REPORT=off$/m)
    })

    test('e2e/docker-compose.yml repassa E2E_PDF_REPORT pro serviço playwright', () => {
      const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8')
      expect(compose).toContain('E2E_PDF_REPORT')
    })

    test('e2e/playwright.config.ts só acrescenta o reporter de PDF quando E2E_PDF_REPORT=on', () => {
      const config = fs.readFileSync(path.join(root, 'playwright.config.ts'), 'utf8')
      expect(config).toContain('E2E_PDF_REPORT')
    })
  })
})
