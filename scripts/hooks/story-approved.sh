#!/bin/sh
# PreToolUse hook (matcher Bash) — gate de commit do fluxo.
# Bloqueia `git commit` em branch de história a menos que:
#
#   MODO v2 (commits por ticket):
#     [x] História revisada  E  nº de reviews APPROVED > nº de commits já
#     feitos na branch (cada review autoriza exatamente 1 commit — impossível
#     commitar um ticket que o subagent não aprovou).
#
#   MODO legado (compatibilidade):
#     [x] Aprovado na story (fluxo antigo de commit único / commit final).
#
# Entrada: JSON do Claude Code em stdin ({tool_input:{command:...}}).
# Saída: exit 0 permite; exit 2 bloqueia (stderr vai pro Claude).

set -u
input=$(cat)

if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
else
  cmd=$input
fi

# Só interessa git commit (a classe inclui aspas p/ o fallback sem jq, em que
# $cmd é o JSON cru e o comando aparece como "command":"git commit ...")
printf '%s' "$cmd" | grep -qE '(^|[;&|"[:space:]])git[[:space:]]+commit' || exit 0

cd "$(git rev-parse --show-toplevel)" 2>/dev/null || exit 0
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

# Fora de branch de história (master/develop já são protegidos remotamente,
# mas bloqueia aqui também por segurança)
case "$branch" in
  master|develop)
    echo "bloqueado: commit direto em '$branch' é proibido — use branch de história." >&2
    exit 2
    ;;
esac

. scripts/lib/story.sh 2>/dev/null || exit 0
# resolve_story_for_branch (não resolve_story): sem o fallback "story mais
# recente" — uma branch de chore avulso sem story própria (slug não bate com
# nenhum arquivo em work_progress/stories/) não deve ficar amarrada ao gate de
# uma story qualquer só porque ela existe no diretório. Ver comentário na lib.
story=$(resolve_story_for_branch 2>/dev/null) || exit 0

# MODO legado: story aprovada libera qualquer commit (fix trivial pós-aprovação — Política A)
if checkbox_marked "$story" 'aprovado[[:space:]]*$'; then
  exit 0
fi

# MODO v2: exige G2 aberto
if ! checkbox_marked "$story" '.*revisada'; then
  echo "bloqueado: story sem [x] História revisada ($story). Aguarde o gate G2." >&2
  exit 2
fi

approved=$(grep -ciE '^[[:space:]]*-[[:space:]]*\[x\][[:space:]*]*T[0-9]+:[[:space:]]*APPROVED' "$story" || true)
commits=$(git rev-list --count develop..HEAD 2>/dev/null || echo 0)

if [ "${approved:-0}" -gt "${commits:-0}" ]; then
  exit 0
fi

echo "bloqueado: $commits commit(s) na branch, $approved review(s) APPROVED registradas em $story." >&2
echo "cada commit de ticket exige um veredito APPROVED do subagent code-reviewer" >&2
echo "registrado via scripts/record-review.sh ANTES do commit." >&2
exit 2
