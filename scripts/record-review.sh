#!/bin/sh
# record-review.sh — registra o veredito APPROVED do subagent code-reviewer.
#
# Uso: scripts/record-review.sh <Tn> <iterações> [story]
#   ex: scripts/record-review.sh T2 1
#   ex. com o corpo da revisão (recomendado): pipe do resultado do subagent via stdin
#     printf '%s\n' "$review_result" | scripts/record-review.sh T2 1
#
# Efeitos na story:
#   1. Adiciona `- [x] Tn: APPROVED (N iteração/iterações) — data` em ## Code Review.
#   2. Se stdin não for um TTY (ex.: piped), lê o corpo da revisão (o texto que o
#      subagent code-reviewer devolveu — Issues/Observações) e o insere, indentado
#      (2 espaços, pra não colidir com regex de heading/checkbox — todas ancoradas
#      em `^`), logo abaixo da linha de veredito. Sem stdin → só a linha, como antes.
#   3. Marca o Status do ticket na tabela de ## Tickets ([] → [x]).
#   4. Quando TODOS os tickets da tabela estiverem [x], marca o gate
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

  # Corpo opcional da revisão (findings do subagent) via stdin. Precisa virar
  # conteúdo ANINHADO sob a linha de veredito, nunca headings de documento:
  #   1. remove "VERDICT:"/"TICKET:" (redundantes — já estão na linha acima);
  #   2. rebaixa qualquer "## heading" do corpo pra "**heading:**" em negrito —
  #      um "##" ali renderiza como heading de página inteira (mesmo peso de
  #      "## Code Review"), quebrando a hierarquia visual;
  #   3. indenta tudo em 2 espaços — não colide com regex ancoradas em ^
  #      (headings, checkboxes, t.Run) E é o que faz markdown tratar as linhas
  #      como continuação aninhada do item de lista, não um bloco solto.
  block="$line"
  if [ ! -t 0 ]; then
    body=$(cat)
    if [ -n "$body" ]; then
      body=$(printf '%s\n' "$body" | grep -vE '^(VERDICT|TICKET):')
      body=$(printf '%s\n' "$body" | sed -E 's/^#+[[:space:]]*(.+)$/**\1:**/')
      # remove linhas em branco líder/final (sobram do grep -v acima)
      body=$(printf '%s\n' "$body" | sed -e '/./,$!d' -e ':a' -e '/^\n*$/{$d;N;ba' -e '}')
      indented=$(printf '%s\n' "$body" | sed 's/^/  /')
      block="$line
$indented"
    fi
  fi

  if grep -q '^## Code Review' "$story"; then
    # insere logo após o heading da seção
    awk -v block="$block" '
      { print }
      /^## Code Review/ && !done { print block; done=1 }
    ' "$story" > "$story.tmp" && mv "$story.tmp" "$story"
  else
    printf '\n## Code Review\n%s\n' "$block" >> "$story"
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
