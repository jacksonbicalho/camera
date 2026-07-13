#!/bin/sh
# await-gate.sh — bloqueia até um gate humano abrir.
# Generaliza await-review.sh / await-approval.sh (removidos).
#
# Uso:
#   scripts/await-gate.sh analise <arquivo-analysis>   # G1: [x] Análise aprovada
#   scripts/await-gate.sh revisao [story]              # G2: [x] História revisada
#   scripts/await-gate.sh aprovado [story]              # legado: CAs todos + [x] Aprovado
#
# Padrões ancorados no início de linha de checkbox, case-insensitive —
# imunes a menções na prosa. Poll de 2s. Rode em background pelo driver.

set -eu
cd "$(git rev-parse --show-toplevel)"
. scripts/lib/story.sh

mode=${1:-}
arg=${2:-}
interval=2

case "$mode" in
  analise)
    file=$arg
    [ -f "$file" ] || { echo "erro: análise não encontrada: $file" >&2; exit 1; }
    pattern='.*aprovada'   # ASCII-safe: casa 'Análise aprovada' em qualquer locale
    ;;
  revisao)
    file=$(resolve_story "$arg")
    pattern='.*revisada'   # ASCII-safe: casa 'História revisada' em qualquer locale
    ;;
  aprovado)
    file=$(resolve_story "$arg")
    pattern='aprovado[[:space:]]*$'  # ancorado: não casa 'aprovada'
    ;;
  *)
    echo "uso: $0 {analise <arquivo>|revisao [story]|aprovado [story]}" >&2
    exit 2
    ;;
esac

echo "aguardando gate '$mode' em $file ..."
while :; do
  if [ "$mode" = "aprovado" ]; then
    # exige: nenhum checkbox de CA desmarcado E [x] Aprovado
    if ! grep -qE '^[[:space:]]*-[[:space:]]*\[\][[:space:]]*CA' "$file" \
       && grep -qiE "^[[:space:]]*-[[:space:]]*\[x\][[:space:]]*$pattern" "$file"; then
      break
    fi
  else
    if grep -qiE "^[[:space:]]*-[[:space:]]*\[x\][[:space:]]*$pattern" "$file"; then
      break
    fi
  fi
  sleep "$interval"
done
echo "gate '$mode' aberto: $file"
