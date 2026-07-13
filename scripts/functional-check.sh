#!/bin/sh
# functional-check.sh — testes funcionais dirigidos pelos critérios de aceite.
#
# Uso: scripts/functional-check.sh [story]
#
# 1. Roda `bash scripts/check.sh` (que já marca o CA1 quando verde).
# 2. Para cada CA da story que referencia `(auto: tests/functional/<script>)`,
#    executa o script; exit 0 → marca o CA `[x]` na story.
# 3. Qualquer cenário falhando → CA fica `[]` e este script sai com erro.
#
# Substitui o story-approval.sh interativo: critério verificável por máquina
# é marcado pela máquina. O driver corrige e re-roda (idempotente).

set -u
cd "$(git rev-parse --show-toplevel)"
. scripts/lib/story.sh

story=$(resolve_story "${1:-}") || exit 1
echo "story: $story"

echo "── CA1: suíte padrão (scripts/check.sh) ──"
if ! bash scripts/check.sh; then
  echo "FALHOU: check.sh vermelho — corrija antes dos cenários funcionais" >&2
  exit 1
fi

fail=0
# Extrai pares "CAn|caminho" das linhas de critérios que referenciam scripts
grep -oE 'CA[0-9]+:.*\(auto:[[:space:]]*tests/functional/[^)]+\)' "$story" \
| sed -E 's/^(CA[0-9]+):.*\(auto:[[:space:]]*(tests\/functional\/[^)[:space:]]+)\).*/\1|\2/' \
| while IFS='|' read -r ca script; do
    printf '── %s: %s ──\n' "$ca" "$script"
    if [ ! -x "$script" ]; then
      echo "FALHOU: cenário ausente ou sem permissão de execução: $script" >&2
      echo "$ca" >> .functional-fails
      continue
    fi
    if "$script"; then
      mark_checkbox "$story" "$ca"
      echo "OK — $ca marcado [x]"
    else
      echo "FALHOU: $ca ($script)" >&2
      echo "$ca" >> .functional-fails
    fi
  done

if [ -f .functional-fails ]; then
  echo ""
  echo "cenários reprovados: $(tr '\n' ' ' < .functional-fails)" >&2
  rm -f .functional-fails
  exit 1
fi

echo ""
echo "todos os cenários funcionais verdes."
