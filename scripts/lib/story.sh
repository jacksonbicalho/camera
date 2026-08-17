#!/bin/sh
# Lib compartilhada: resolve o arquivo da story pela branch atual.
# Uso: . scripts/lib/story.sh; story="$(resolve_story [caminho-explicito])"
# Convenção: branch <tipo>/<slug> ↔ work_progress/stories/YYYYMMDDHHmm_<slug>.md
# Fallback: story mais recente em work_progress/stories/ (nome com timestamp ordena sozinho).

# Locale: padrões com acentos quebram em locale C; força UTF-8 quando possível
if locale -a 2>/dev/null | grep -qi 'C.utf-\?8'; then
  export LC_ALL=${LC_ALL:-C.UTF-8}
fi

resolve_story() {
  if [ -n "$1" ] && [ -f "$1" ]; then
    printf '%s\n' "$1"
    return 0
  fi
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || branch=""
  slug=${branch#*/}
  if [ -n "$slug" ] && [ "$slug" != "$branch" ]; then
    match=$(ls work_progress/stories/*_"$slug".md 2>/dev/null | tail -n 1)
    if [ -n "$match" ]; then
      printf '%s\n' "$match"
      return 0
    fi
  fi
  latest=$(ls work_progress/stories/*.md 2>/dev/null | tail -n 1)
  if [ -n "$latest" ]; then
    printf '%s\n' "$latest"
    return 0
  fi
  echo "erro: nenhuma story encontrada (branch: ${branch:-?})" >&2
  return 1
}

# resolve_story_for_branch — como resolve_story, mas SEM o fallback "story mais
# recente": só resolve se o slug da branch atual bater com uma story de verdade.
# Usado pelo hook de commit (story-approved.sh): uma branch de chore avulso, sem
# story própria (ex. chore/devcontainer-jq), não pode ficar amarrada à story
# mais recente só porque ela existe no diretório — isso bloquearia commits sem
# relação nenhuma com o gate daquela story.
resolve_story_for_branch() {
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || branch=""
  slug=${branch#*/}
  if [ -n "$slug" ] && [ "$slug" != "$branch" ]; then
    match=$(ls work_progress/stories/*_"$slug".md 2>/dev/null | tail -n 1)
    if [ -n "$match" ]; then
      printf '%s\n' "$match"
      return 0
    fi
  fi
  return 1
}

# Checkbox helpers — convenção do repo: não-marcado `[]`, marcado `[x]`.
# checkbox_marked <arquivo> <texto>  → 0 se `- [x] <texto>` existe (case-insensitive)
checkbox_marked() {
  grep -qiE "^[[:space:]]*-[[:space:]]*\[x\][[:space:]]*$2" "$1"
}

# mark_checkbox <arquivo> <texto>  → troca `- [] <texto>` por `- [x] <texto>` (1ª ocorrência)
mark_checkbox() {
  file=$1; text=$2
  # sed com escape básico do texto para uso na regex
  esc=$(printf '%s' "$text" | sed 's/[][\.*^$/]/\\&/g')
  sed -i "0,/^\([[:space:]]*-[[:space:]]*\)\[\][[:space:]]*${esc}/s//\1[x] ${text}/" "$file"
}

# Coluna `Issue` da tabela `## Tickets` (formato `| # | Descrição | Depende
# de | Issue | Status |`, "Issue" antes de "Status" pra não quebrar o
# parsing acima que assume Status como último campo): `#<numero>` quando a
# issue já foi criada por scripts/create-ticket-issues.sh, `—`/vazio caso
# contrário.

# resolve_ticket_issue <arquivo> <Tn>  → imprime o número da issue
# registrada pro ticket (sem o `#`), vazio se não houver.
resolve_ticket_issue() {
  story=$1; ticket=$2
  line=$(grep -E "^\|[[:space:]]*${ticket}[[:space:]]*\|" "$story" | head -n1) || true
  [ -z "$line" ] && return 0
  issue=$(printf '%s' "$line" | awk -F'|' '{print $5}' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  case "$issue" in
    '#'[0-9]*) printf '%s\n' "${issue#\#}" ;;
  esac
}

# resolve_ticket_by_issue <arquivo> <numero>  → imprime o Tn cuja Issue
# registrada é <numero> (sem o `#`), vazio se não houver. Base do comando
# `/act <numero>`.
resolve_ticket_by_issue() {
  story=$1; n=$2
  grep -E '^\|[[:space:]]*T[0-9]+[[:space:]]*\|' "$story" | while IFS='|' read -r _ ticket _ _ issue _ _; do
    ticket=$(printf '%s' "$ticket" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
    issue=$(printf '%s' "$issue" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^#//')
    if [ "$issue" = "$n" ]; then
      printf '%s\n' "$ticket"
      break
    fi
  done
}

# closes_refs <arquivo>  → "Closes #N1, #N2, ..." pra todos os tickets com
# Issue registrada; string vazia se nenhum. Usado por scripts/push-pr.sh no
# corpo do PR, pra fechar as issues automaticamente no merge.
closes_refs() {
  story=$1
  awk -F'|' '
    $0 ~ /^\|[[:space:]]*T[0-9]+[[:space:]]*\|/ {
      issue = $5
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", issue)
      if (issue ~ /^#[0-9]+$/) {
        if (out != "") out = out ", "
        out = out issue
      }
    }
    END { if (out != "") print "Closes " out }
  ' "$story"
}

# close_ticket_issues <arquivo>  → fecha (gh issue close) a Issue de cada
# ticket com Issue registrada. Necessário porque a keyword `Closes #N` no
# corpo do PR só fecha a issue automaticamente quando o GitHub mergeia no
# branch DEFAULT do repositório — PRs de ticket sempre mergeiam em
# `develop`, que não é o default (`master` é), então o fechamento
# automático passivo não dispara; scripts/merge-when-green.sh chama esta
# função explicitamente no merge. Best-effort: falha de rede/permissão não
# pode abortar o merge, que já aconteceu.
close_ticket_issues() {
  story=$1
  grep -E '^\|[[:space:]]*T[0-9]+[[:space:]]*\|' "$story" | while IFS='|' read -r _ ticket _ _ issue _ _; do
    issue=$(printf '%s' "$issue" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
    case "$issue" in
      '#'[0-9]*)
        n=${issue#\#}
        gh issue close "$n" >/dev/null 2>&1 \
          || echo "aviso: não foi possível fechar a issue #$n" >&2
        ;;
    esac
  done
}
