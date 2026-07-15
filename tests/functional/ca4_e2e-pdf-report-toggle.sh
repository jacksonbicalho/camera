#!/bin/sh
# CA4: a geração do PDF é controlada por E2E_PDF_REPORT — documentada em
# e2e/.env.example (default 'off'), repassada pelo compose e só entra no
# array de reporters do Playwright quando 'on'.
set -eu
cd "$(git rev-parse --show-toplevel)"

grep -q '^E2E_PDF_REPORT=off$' e2e/.env.example || {
  echo "CA4 FALHOU: e2e/.env.example não documenta E2E_PDF_REPORT=off (default)"
  exit 1
}
grep -q 'E2E_PDF_REPORT' e2e/docker-compose.yml || {
  echo "CA4 FALHOU: e2e/docker-compose.yml não repassa E2E_PDF_REPORT pro serviço playwright"
  exit 1
}
grep -q 'E2E_PDF_REPORT' e2e/playwright.config.ts || {
  echo "CA4 FALHOU: e2e/playwright.config.ts não lê E2E_PDF_REPORT"
  exit 1
}

echo "CA4 OK"
