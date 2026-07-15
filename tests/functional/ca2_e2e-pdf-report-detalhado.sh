#!/bin/sh
# CA2: com E2E_PDF_REPORT=on, o report.pdf gerado inclui a árvore de passos
# (steps) de cada teste — não só título/status/duração/erro/screenshot como
# antes. O texto renderizado pelo Chromium (page.pdf()) usa fontes CID
# subsetadas: as strings dentro de "(...) Tj"/"<...> Tj" não são ASCII
# legível (glyph ids), então não dá pra grepar palavras do título — o sinal
# estrutural confiável é a CONTAGEM de operadores de desenho de texto
# (Tj/TJ) por página de conteúdo, que cresce proporcionalmente à quantidade
# de linhas de texto renderizadas. Sem steps, cada página de teste tem só
# ~4-5 operadores (título+status, duração) — com a árvore de steps (cada
# teste destes specs tem várias ações automáticas: goto/fill/click/expect no
# beforeEach + mais no corpo do teste), esse número sobe bem além disso.
set -eu
cd "$(git rev-parse --show-toplevel)"

[ -f e2e/reporters/pdf-reporter.ts ] || {
  echo "CA2 FALHOU: e2e/reporters/pdf-reporter.ts não existe ainda"
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

# Baseline sem steps (versão anterior do reporter): ~4-5 operadores Tj/TJ por
# teste (título+status, duração). Exigimos bem mais que isso por teste —
# margem generosa (8x) que só a árvore de steps consegue alcançar, sem
# depender do número exato de steps que o Playwright gera internamente.
min_expected=$((n_tests * 8))

[ "$total_tj" -ge "$min_expected" ] || {
  echo "CA2 FALHOU: PDF tem $total_tj operador(es) de texto (Tj/TJ), esperava >= $min_expected ($n_tests testes) — árvore de passos não parece estar sendo renderizada"
  exit 1
}

echo "CA2 OK ($total_tj operadores de texto para $n_tests testes)"
