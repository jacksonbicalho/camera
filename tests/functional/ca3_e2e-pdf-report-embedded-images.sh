#!/bin/sh
# CA3: todos os screenshots produzidos pela run ficam embutidos no PDF como
# imagem (bytes dentro do próprio arquivo) — nunca como .png separado ao
# lado nem como referência/link externo pro diretório data/ do reporter
# oficial.
set -eu
cd "$(git rev-parse --show-toplevel)"

[ -f e2e/reporters/pdf-reporter.ts ] || {
  echo "CA3 FALHOU: e2e/reporters/pdf-reporter.ts não existe ainda"
  exit 1
}

PDF=e2e/playwright-report/report.pdf
if [ ! -f "$PDF" ]; then
  E2E_PDF_REPORT=on E2E_SCREENSHOT=on bash scripts/e2e.sh || {
    echo "CA3 FALHOU: scripts/e2e.sh não passou com E2E_PDF_REPORT=on"
    exit 1
  }
fi
[ -f "$PDF" ] || {
  echo "CA3 FALHOU: $PDF não foi gerado"
  exit 1
}

n_tests=$(grep -rhoE '^[[:space:]]*test\(' e2e/tests/*.spec.ts | wc -l | tr -d ' ')

images=$(python3 -c "
import re
data = open('$PDF', 'rb').read()
print(len(re.findall(rb'/Subtype\s*/Image', data)))
")

[ "$images" -ge "$n_tests" ] || {
  echo "CA3 FALHOU: PDF tem $images objeto(s) /Image, esperava >= $n_tests (1 screenshot por teste, E2E_SCREENSHOT=on) — screenshots não parecem embutidos"
  exit 1
}

if grep -aq 'playwright-report/data/' "$PDF"; then
  echo "CA3 FALHOU: PDF referencia caminho externo (playwright-report/data/) em vez de embutir a imagem"
  exit 1
fi

echo "CA3 OK ($images imagens embutidas para $n_tests testes)"
