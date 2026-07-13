#!/bin/sh
# record-review.sh — registra o veredito APPROVED do subagent code-reviewer.
#
# Uso: scripts/record-review.sh <Tn> <iterações> [story]
#   ex: scripts/record-review.sh T2 1
#
# Efeitos na story:
#   1. Adiciona `- [x] Tn: APPROVED (N iteração/iterações) — data` em ## Code Review.
#   2. Marca o Status do ticket na tabela de ## Tickets ([] → [x]).
#   3. Quando TODOS os tickets da tabela estiverem [x], marca o gate
#      `- [] Review: APPROVED` → `- [x] Review: APPROVED`.
#
# O hook de pre-commit (story-approved.sh) usa a contagem de linhas APPROVED
# para autorizar 1 commit por review — então rode este script ANTES do commit
# do ticket, e somente com VERDICT: APPROVED em mãos.

set -eu
cd "$(git rev-parse --show-toplevel)"
. scripts/lib/story.sh

ticket=${1:?"uso: $0 <Tn> <iterações> [story]"}
iters=${2:?"uso: $0 <Tn> <iterações> [story]"}
story=$(resolve_story "${3:-}")

case "$ticket" in
  T[0-9]*) ;;
  *) echo "erro: ticket inválido '$ticket' (esperado T1, T2, ...)" >&2; exit 2 ;;
esac

if grep -qE "^[[:space:]]*-[[:space:]]*\[x\][[:space:]]*${ticket}:[[:space:]]*APPROVED" "$story"; then
  echo "já registrado: $ticket APPROVED em $story (idempotente)"
else
  plural="iterações"; [ "$iters" = "1" ] && plural="iteração"
  line="- [x] ${ticket}: APPROVED (${iters} ${plural}) — $(date '+%Y-%m-%d %H:%M')"
  if grep -q '^## Code Review' "$story"; then
    # insere logo após o heading da seção
    awk -v line="$line" '
      { print }
      /^## Code Review/ && !done { print line; done=1 }
    ' "$story" > "$story.tmp" && mv "$story.tmp" "$story"
  else
    printf '\n## Code Review\n%s\n' "$line" >> "$story"
  fi
  echo "registrado: $line"
fi

# Marca o Status do ticket na tabela (linha `| Tn | ... | [] |` → `[x]`)
sed -i "s/^\(|[[:space:]]*${ticket}[[:space:]]*|.*|[[:space:]]*\)\[\]\([[:space:]]*|\)/\1[x]\2/" "$story"

# Se todos os tickets da tabela estão [x], abre o gate Review: APPROVED
total=$(grep -cE '^\|[[:space:]]*T[0-9]+[[:space:]]*\|' "$story" || true)
done_n=$(grep -cE '^\|[[:space:]]*T[0-9]+[[:space:]]*\|.*\[x\][[:space:]]*\|' "$story" || true)
if [ "$total" -gt 0 ] && [ "$total" = "$done_n" ]; then
  mark_checkbox "$story" "Review: APPROVED"
  echo "todos os $total tickets aprovados — gate 'Review: APPROVED' aberto"
else
  echo "progresso de review: $done_n/$total tickets"
fi
