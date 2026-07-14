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
