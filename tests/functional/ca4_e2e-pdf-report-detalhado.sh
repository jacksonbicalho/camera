#!/bin/sh
# CA4: os screenshots do PDF ficam num container com espaçamento próprio
# (.screenshots, flex + gap) — o navigator iterou o tamanho por 3 rodadas
# (260px → 380px → 480px) e decidiu, no fim, que a imagem deve ocupar quase
# a largura toda da página (max-width: 100%, responsivo ao container) — o
# ganho de "caber mais informação por página" veio do espaçamento/borda do
# container, não de reduzir a largura da imagem. Mesmo motivo do CA3 pra
# checar o código-fonte em vez do PDF gerado: layout de página não é algo
# que dá pra inspecionar de forma confiável nos bytes do PDF sem renderizar
# a página de verdade.
set -eu
cd "$(git rev-parse --show-toplevel)"

SRC=e2e/reporters/pdf-reporter.ts

[ -f "$SRC" ] || {
  echo "CA4 FALHOU: $SRC não existe ainda"
  exit 1
}

grep -Eq 'img\.screenshot[[:space:]]*\{[^}]*max-width:[[:space:]]*100%' "$SRC" || {
  echo "CA4 FALHOU: img.screenshot não usa max-width: 100% (imagem deveria ocupar quase a página toda)"
  exit 1
}

grep -Eq '\.screenshots[[:space:]]*\{[^}]*display:[[:space:]]*flex' "$SRC" || {
  echo "CA4 FALHOU: container .screenshots não usa display: flex (perdeu o espaçamento/wrap entre múltiplos screenshots)"
  exit 1
}

grep -Eq '\.screenshots[[:space:]]*\{[^}]*gap:' "$SRC" || {
  echo "CA4 FALHOU: container .screenshots não define gap (perdeu o espaçamento entre múltiplos screenshots)"
  exit 1
}

echo "CA4 OK (max-width: 100%, container .screenshots com flex+gap)"
