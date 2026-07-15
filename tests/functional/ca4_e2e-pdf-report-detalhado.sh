#!/bin/sh
# CA4: os screenshots do PDF são renderizados com largura reduzida (não mais
# 100% da página), pra caber mais conteúdo (a árvore de steps do CA2) em
# cada página. Mesmo motivo do CA3 pra checar o código-fonte em vez do PDF
# gerado: o layout de página não é algo que dá pra inspecionar de forma
# confiável nos bytes do PDF sem renderizar a página de verdade.
set -eu
cd "$(git rev-parse --show-toplevel)"

SRC=e2e/reporters/pdf-reporter.ts

[ -f "$SRC" ] || {
  echo "CA4 FALHOU: $SRC não existe ainda"
  exit 1
}

max_width_px=$(python3 -c "
import re
src = open('$SRC').read()
m = re.search(r'img\.screenshot\s*\{([^}]*)\}', src, re.DOTALL)
if not m:
    print('')
else:
    w = re.search(r'max-width:\s*(\d+)px', m.group(1))
    print(w.group(1) if w else '')
")

[ -n "$max_width_px" ] || {
  echo "CA4 FALHOU: img.screenshot não define max-width em px (ainda 100% da página, ou seletor mudou)"
  exit 1
}

[ "$max_width_px" -le 400 ] || {
  echo "CA4 FALHOU: img.screenshot max-width é ${max_width_px}px, esperava <= 400px (screenshot ainda ocupa quase a página toda)"
  exit 1
}

echo "CA4 OK (max-width: ${max_width_px}px)"
