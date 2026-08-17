#!/bin/sh
# create-ticket-issues.sh — cria 1 Issue do GitHub por ticket da story sem
# Issue registrada (coluna `Issue` da tabela `## Tickets`, formato `#<n>`
# ou `—`/vazio quando ainda não existe), gravando o número de volta na
# própria tabela. Idempotente: ticket que já tem Issue não é recriado.
#
# Uso: scripts/create-ticket-issues.sh <story>
#   (ou como lib: CREATE_TICKET_ISSUES_SH_LIB=1 . scripts/create-ticket-issues.sh)

set -u

# _ticket_section_body <story> <Tn> — corpo da seção "### Tn — título"
# (até o próximo heading de nível 2+ — outro "### Tn" ou o "## Critérios
# de Aceitação"/"## Gates"/etc. que vem depois do ÚLTIMO ticket — ou fim
# do arquivo), mesmo padrão do section() de push-pr.sh, mas para
# subseções de ticket em vez de "## heading". `##+` (POSIX ERE, portável
# sem depender de {n,}) casa "##" ou mais — para em QUALQUER heading de
# nível 2 ou 3, não só em outro ticket.
_ticket_section_body() {
  story=$1; ticket=$2
  awk -v ticket="$ticket" '
    $0 ~ "^### " ticket "([[:space:]]|$)" { f=1; next }
    f && /^##+[[:space:]]/ { f=0 }
    f { print }
  ' "$story"
}

# create_ticket_issues <story>
create_ticket_issues() {
  story=$1
  rows=$(grep -E '^\|[[:space:]]*T[0-9]+[[:space:]]*\|' "$story" || true)
  [ -z "$rows" ] && return 0

  printf '%s\n' "$rows" | while IFS='|' read -r _ ticket desc depende issue status _; do
    ticket=$(printf '%s' "$ticket" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
    [ -z "$ticket" ] && continue
    desc=$(printf '%s' "$desc" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
    issue=$(printf '%s' "$issue" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')

    case "$issue" in
      ''|'—') ;;
      *) echo "· $ticket já tem Issue registrada ($issue) — pulando"; continue ;;
    esac

    body=$(_ticket_section_body "$story" "$ticket")
    [ -z "$body" ] && body="(ver $story)"
    title="$ticket — $desc"

    url=$(gh issue create --title "$title" --body "$body")
    n=$(printf '%s' "$url" | grep -oE '[0-9]+$' | tail -n1)
    if [ -z "$n" ]; then
      echo "aviso: não foi possível extrair o número da issue criada pra $ticket (saída: $url)" >&2
      continue
    fi

    awk -v ticket="$ticket" -v n="#$n" -F'|' 'BEGIN{OFS="|"}
      $0 ~ "^\\|[[:space:]]*" ticket "[[:space:]]*\\|" { $5 = " " n " " }
      { print }
    ' "$story" > "$story.tmp" && mv "$story.tmp" "$story"

    echo "criada: $ticket → issue #$n"
  done
}

# Carregado como biblioteca (testes): só as funções, sem rodar nada.
[ -n "${CREATE_TICKET_ISSUES_SH_LIB:-}" ] && return 0

story=${1:?"uso: $0 <story>"}
create_ticket_issues "$story"
