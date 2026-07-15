#!/bin/sh
# CA3: o título do PDF inclui o nome do sistema ("os-camera") e a data de
# geração por extenso em pt-BR. O texto renderizado pelo Chromium usa
# fontes CID subsetadas (glyph ids, não ASCII) — não dá pra grepar o texto
# dentro do PDF gerado (ver comentário do CA2). O sinal confiável aqui é a
# fonte: o reporter monta o <h1> a partir do nome do sistema + uma data
# formatada por extenso (pt-BR), então verificamos isso no código-fonte do
# reporter — mesmo padrão já usado por
# tests/functional/ca4_e2e-pdf-report-toggle.sh (história anterior) para
# aspectos que não são observáveis no artefato binário final.
set -eu
cd "$(git rev-parse --show-toplevel)"

SRC=e2e/reporters/pdf-reporter.ts

[ -f "$SRC" ] || {
  echo "CA3 FALHOU: $SRC não existe ainda"
  exit 1
}

grep -q 'os-camera' "$SRC" || {
  echo "CA3 FALHOU: $SRC não referencia o nome do sistema (\"os-camera\") no título"
  exit 1
}

grep -Eq "Intl\.DateTimeFormat\('pt-BR'" "$SRC" || {
  echo "CA3 FALHOU: $SRC não formata a data de geração em pt-BR (Intl.DateTimeFormat('pt-BR', ...))"
  exit 1
}

grep -Eq "dateStyle:\s*'long'" "$SRC" || {
  echo "CA3 FALHOU: $SRC não formata a data por extenso (dateStyle: 'long')"
  exit 1
}

echo "CA3 OK"
