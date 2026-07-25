#!/usr/bin/env bash
# Verifica o CONTEÚDO do PDF gerado pelo reporter customizado (e2e/reporters/
# pdf-reporter.ts) — comportamento que só existe depois que a suíte inteira
# roda (o PDF é montado no onEnd() do reporter, ao fim de todos os testes),
# então não dá pra virar um test('CAn: ...') dentro da própria suíte
# Playwright (ela ainda não terminou de rodar nem gerou o PDF que estaria
# inspecionando). Por isso este script: roda a suíte com E2E_PDF_REPORT=on
# e E2E_SCREENSHOT=on e, com o report.pdf resultante, confere 3 propriedades
# estruturais do PDF (ver "Testes funcionais" em docs/workflow.md — checagens
# que exigem subir o binário completo/orquestrar múltiplos processos ficam
# como script, não como teste nomeado).
#
# Checagens estáticas do reporter (título/data, CSS dos screenshots, wiring
# do toggle E2E_PDF_REPORT) já são testes nomeados via bun:test — ver
# e2e/reporters/pdf-reporter.test.ts, rodado por scripts/e2e-lint-check.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PDF=e2e/playwright-report/report.pdf
# Sem rm -f local: playwright-report/ é escrito pelo container (root) e pode
# não ser gravável pelo usuário do host — o próprio onEnd() do reporter
# sobrescreve o arquivo a cada run (fs.mkdirSync + page.pdf({path: outPath})).

E2E_PDF_REPORT=on E2E_SCREENSHOT=on bash scripts/e2e.sh || {
  echo "FALHOU: scripts/e2e.sh não passou com E2E_PDF_REPORT=on"
  exit 1
}

[ -f "$PDF" ] || {
  echo "FALHOU: $PDF não foi gerado"
  exit 1
}

n_tests=$(grep -rhoE '^[[:space:]]*test\(' e2e/tests/*.spec.ts | wc -l | tr -d ' ')

# 1) contagem de páginas: o PDF tem >= 1 página por teste (não um resumo
# colapsado de 1 página — a falha que a análise original encontrou na
# tentativa ingênua de "imprimir o index.html oficial").
pages=$(python3 -c "
import re
data = open('$PDF', 'rb').read()
print(len(re.findall(rb'/Type\s*/Page(?!s)', data)))
")
[ "$pages" -ge "$n_tests" ] || {
  echo "FALHOU: PDF tem $pages página(s), esperava >= $n_tests (1 por teste) — parece um resumo colapsado, não dados detalhados"
  exit 1
}
echo "OK: $pages páginas para $n_tests testes (dados detalhados, não resumo colapsado)"

# 2) árvore de passos: o texto renderizado usa fontes CID subsetadas (glyph
# ids, não ASCII) — não dá pra grepar palavras do título. O sinal estrutural
# confiável é a contagem de operadores de desenho de texto (Tj/TJ), que
# cresce proporcionalmente à quantidade de linhas renderizadas. Sem a árvore
# de steps, cada página tem só ~4-5 operadores (título+status, duração);
# margem generosa (8x) que só a árvore de steps alcança.
total_tj=$(python3 -c "
import re, zlib

data = open('$PDF', 'rb').read()
total = 0
for m in re.finditer(rb'(\d+) 0 obj\s*(<<.*?>>)\s*stream\r?\n(.*?)endstream', data, re.DOTALL):
    objdict, raw = m.group(2), m.group(3)
    if b'/Length1' in objdict or b'/Image' in objdict:
        continue  # font program ou imagem, não conteúdo de texto
    try:
        content = zlib.decompress(raw) if b'FlateDecode' in objdict else raw
    except Exception:
        continue
    if len(content) > 100000:
        continue  # guarda extra contra stream de imagem mal-classificado
    total += len(re.findall(rb'[)>]\s*Tj', content))
    total += len(re.findall(rb'\]\s*TJ', content))
print(total)
")
min_expected=$((n_tests * 8))
[ "$total_tj" -ge "$min_expected" ] || {
  echo "FALHOU: PDF tem $total_tj operador(es) de texto (Tj/TJ), esperava >= $min_expected ($n_tests testes) — árvore de passos não parece estar sendo renderizada"
  exit 1
}
echo "OK: $total_tj operadores de texto para $n_tests testes (árvore de passos renderizada)"

# 3) screenshots embutidos como imagem no próprio PDF — nunca .png separado
# nem referência externa ao diretório data/ do reporter oficial.
images=$(python3 -c "
import re
data = open('$PDF', 'rb').read()
print(len(re.findall(rb'/Subtype\s*/Image', data)))
")
[ "$images" -ge "$n_tests" ] || {
  echo "FALHOU: PDF tem $images objeto(s) /Image, esperava >= $n_tests (1 screenshot por teste, E2E_SCREENSHOT=on) — screenshots não parecem embutidos"
  exit 1
}
if grep -aq 'playwright-report/data/' "$PDF"; then
  echo "FALHOU: PDF referencia caminho externo (playwright-report/data/) em vez de embutir a imagem"
  exit 1
fi
echo "OK: $images imagens embutidas para $n_tests testes (sem referência externa)"

echo "e2e-pdf-report-check: tudo verde"
