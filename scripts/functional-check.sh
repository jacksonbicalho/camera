#!/bin/sh
# functional-check.sh — testes funcionais dirigidos pelos critérios de aceite.
#
# Uso: scripts/functional-check.sh [story]
#
# Todo CA é um teste nomeado dentro da suíte nativa correspondente (frontend:
# describe('CAn: ...'); Go: t.Run("CAn: ..."); Python: def test_caN_...();
# e2e/infra: named checks num script permanente reusável) — nunca um script
# avulso por CA. A story só ANOTA qual comando prova o critério:
# `(auto: <comando>)` — qualquer texto livre entre "auto:" e o `)` de
# fechamento (pode ter env var prefixada, ex.: `E2E_PDF_REPORT=on bash
# scripts/e2e-pdf-report-check.sh`).
#
# 1. Roda `bash scripts/check.sh` (sempre — é o comando universal, cobre
#    CA1 e qualquer outro CA anotado `(auto: scripts/check.sh)`).
# 2. Para cada comando ÚNICO restante referenciado na story (exceto
#    `scripts/check.sh`, já coberto acima), roda esse comando uma vez;
#    sucesso marca `[x]` todo CA que o referencia.
# 3. Qualquer comando falhando → os CAs que o referenciam ficam `[]` e este
#    script sai com erro.
#
# Substitui o story-approval.sh interativo: critério verificável por máquina
# é marcado pela máquina. O driver corrige e re-roda (idempotente).

set -u
cd "$(git rev-parse --show-toplevel)"
. scripts/lib/story.sh

# extract_auto_commands <story> — imprime "CAn|comando" por linha de CA
# anotada `(auto: <comando>)` — comando é o texto entre "auto:" e o ')' de
# fechamento (sem parênteses aninhados, convenção do repo).
extract_auto_commands() {
  story_file=$1
  grep -oE 'CA[0-9]+:.*\(auto:[[:space:]]*[^)]+\)' "$story_file" \
  | sed -E 's/^(CA[0-9]+):.*\(auto:[[:space:]]*([^)]+)\).*/\1|\2/'
}

# mark_command_criteria <story> <comando> — marca [x] todo CA cujo `(auto:
# <comando>)` bate EXATAMENTE com o comando dado (sem rodar nada — quem chama
# já confirmou que o comando passou).
mark_command_criteria() {
  story_file=$1
  command=$2
  extract_auto_commands "$story_file" \
  | while IFS='|' read -r ca cmd; do
      [ "$cmd" = "$command" ] || continue
      mark_checkbox "$story_file" "$ca"
      echo "OK — $ca marcado [x] (coberto por: $command)"
    done
}

# Mantido pelo nome antigo por compatibilidade de quem já invoca a lib
# (scripts/functional_check_test.go) — agora só um wrapper fino sobre o
# comando fixo "scripts/check.sh".
mark_check_sh_criteria() {
  mark_command_criteria "$1" "scripts/check.sh"
}

# Carregado como biblioteca (scripts/functional_check_test.go): só as funções,
# sem rodar check.sh nem resolver a story do repo real.
[ -n "${FUNCTIONAL_CHECK_SH_LIB:-}" ] && return 0

story=$(resolve_story "${1:-}") || exit 1
echo "story: $story"

echo "── suíte padrão (scripts/check.sh) ──"
if ! bash scripts/check.sh; then
  echo "FALHOU: check.sh vermelho — corrija antes dos cenários funcionais" >&2
  exit 1
fi
mark_command_criteria "$story" "scripts/check.sh"

fail=0
commands_file=$(mktemp)
trap 'rm -f "$commands_file"' EXIT

extract_auto_commands "$story" | cut -d'|' -f2- | sort -u > "$commands_file"

while IFS= read -r cmd; do
  [ -z "$cmd" ] && continue
  # Comparação textual exata — assume que toda story anota a string literal
  # "scripts/check.sh" (convenção documentada). Uma variação tipo "bash
  # scripts/check.sh" não seria reconhecida como o mesmo comando e rodaria a
  # suíte inteira de novo via eval (não quebra nada, só redundante).
  [ "$cmd" = "scripts/check.sh" ] && continue
  printf '── comando: %s ──\n' "$cmd"
  # </dev/null: sem isso, um comando que repassa/lê stdin (ex.: docker compose
  # exec sem -T em algum passo interno) consome os bytes do PRÓPRIO
  # commands_file que este `while read` está lendo (fd 0 compartilhado entre
  # o loop e o subshell do eval) — o loop então perde as linhas seguintes e
  # sai silenciosamente sem erro, deixando comandos (e os CAs que dependem
  # deles) sem rodar. Achado real: com 2 comandos `e2e-spec-check.sh`
  # distintos na mesma story, só o primeiro rodava.
  if (eval "$cmd" </dev/null); then
    mark_command_criteria "$story" "$cmd"
  else
    echo "FALHOU: $cmd" >&2
    extract_auto_commands "$story" \
    | while IFS='|' read -r ca c; do
        [ "$c" = "$cmd" ] && echo "$ca" >> .functional-fails
      done
    fail=1
  fi
done < "$commands_file"

if [ -f .functional-fails ]; then
  echo ""
  echo "cenários reprovados: $(tr '\n' ' ' < .functional-fails)" >&2
  rm -f .functional-fails
  exit 1
fi

if [ "$fail" -eq 1 ]; then
  exit 1
fi

echo ""
echo "todos os cenários funcionais verdes."
