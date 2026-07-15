#!/bin/sh
# CA2: com E2E_PDF_REPORT=on e E2E_SCREENSHOT=on, o report.pdf gerado
# contém dados detalhados de TODOS os testes executados — não um resumo
# colapsado de 1 página (a falha que a análise encontrou na tentativa
# ingênua de "imprimir o index.html oficial").
set -eu
cd "$(git rev-parse --show-toplevel)"

[ -f e2e/reporters/pdf-reporter.ts ] || {
  echo "CA2 FALHOU: e2e/reporters/pdf-reporter.ts não existe ainda"
  exit 1
}
grep -q 'E2E_PDF_REPORT' e2e/playwright.config.ts || {
  echo "CA2 FALHOU: e2e/playwright.config.ts ainda não lê E2E_PDF_REPORT"
  exit 1
}

PDF=e2e/playwright-report/report.pdf
rm -f "$PDF"

E2E_PDF_REPORT=on E2E_SCREENSHOT=on bash scripts/e2e.sh || {
  echo "CA2 FALHOU: scripts/e2e.sh não passou com E2E_PDF_REPORT=on"
  exit 1
}

[ -f "$PDF" ] || {
  echo "CA2 FALHOU: $PDF não foi gerado"
  exit 1
}

n_tests=$(grep -rhoE '^[[:space:]]*test\(' e2e/tests/*.spec.ts | wc -l | tr -d ' ')

pages=$(python3 -c "
import re
data = open('$PDF', 'rb').read()
print(len(re.findall(rb'/Type\s*/Page(?!s)', data)))
")

[ "$pages" -ge "$n_tests" ] || {
  echo "CA2 FALHOU: PDF tem $pages página(s), esperava >= $n_tests (1 por teste) — parece um resumo colapsado, não dados detalhados"
  exit 1
}

echo "CA2 OK ($pages páginas para $n_tests testes)"
