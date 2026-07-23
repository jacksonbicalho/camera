#!/bin/sh
# functional-check.sh — testes funcionais dirigidos pelos critérios de aceite.
#
# Uso: scripts/functional-check.sh [story]
#
# 1. Roda `bash scripts/check.sh` (que já marca o CA1 quando verde).
# 2. Para cada CA da story que referencia `(auto: tests/functional/<script>)`,
#    executa o script; exit 0 → marca o CA `[x]` na story.
# 3. Para cada CA (além do 1) anotado `(auto: scripts/check.sh)` — critério de
#    frontend coberto por um describe('CAX: ...') na própria suíte, sem
#    cenário dedicado — marca `[x]` direto: já foi verificado pela suíte
#    inteira no passo 1.
# 4. Qualquer cenário falhando → CA fica `[]` e este script sai com erro.
#
# Substitui o story-approval.sh interativo: critério verificável por máquina
# é marcado pela máquina. O driver corrige e re-roda (idempotente).

set -u
cd "$(git rev-parse --show-toplevel)"
. scripts/lib/story.sh

# mark_check_sh_criteria <story> — marca [x] todo CA anotado
# `(auto: scripts/check.sh)` (inclusive o próprio CA1). Extraída como função
# pra ser testável isoladamente (scripts/functional_check_test.go, mesmo
# padrão de CHECK_SH_LIB em check.sh) sem precisar rodar check.sh de verdade.
mark_check_sh_criteria() {
  story_file=$1
  grep -oE 'CA[0-9]+:.*\(auto:[[:space:]]*scripts/check\.sh\)' "$story_file" \
  | sed -E 's/^(CA[0-9]+):.*/\1/' \
  | while IFS= read -r ca; do
      mark_checkbox "$story_file" "$ca"
      echo "OK — $ca marcado [x] (coberto por scripts/check.sh)"
    done
}

# Carregado como biblioteca (scripts/functional_check_test.go): só a função,
# sem rodar check.sh nem resolver a story do repo real.
[ -n "${FUNCTIONAL_CHECK_SH_LIB:-}" ] && return 0

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

# CAs cobertos pelo próprio check.sh (frontend com describe('CAX: ...') em vez
# de cenário dedicado) — já garantidos verdes pela rodada do passo 1 acima;
# só precisam ser marcados. Inclui o próprio CA1 (idempotente: mark_checkbox
# não faz nada se já estiver `[x]`).
mark_check_sh_criteria "$story"

echo ""
echo "todos os cenários funcionais verdes."
