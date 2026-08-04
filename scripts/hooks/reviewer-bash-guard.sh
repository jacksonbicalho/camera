#!/bin/sh
# PreToolUse(Bash) hook — escopado ao subagent code-reviewer (declarado no
# próprio .claude/agents/code-reviewer.md, não em .claude/settings.json: um
# hook lá se aplicaria à sessão principal inteira, não só a este subagent).
#
# Existe porque `Bash(git diff:*)` etc. no campo `tools:` do frontmatter de
# um agente NÃO restringe comando nenhum — é sintaxe não suportada pela
# plataforma, ignorada silenciosamente (concede Bash irrestrito). Confirmado
# na prática: um review real rodou `docker run`, `find /`, `nohup npx vite`,
# `sed -i`, `kill` — tudo fora da lista documentada — só porque nada barrava.
# Este hook é a única restrição de comando que é de fato aplicada.
#
# Whitelist: só o que o code-reviewer genuinamente precisa — ler o diff/log
# do ticket, rodar a suíte (scripts/check.sh, sem argumento) e rodar UM spec
# e2e já escrito pelo driver (scripts/e2e-spec-check.sh <spec>). Nunca escreve
# nem roda nada além disso — se precisar de mais pra revisar algo, o achado é
# "cobertura empírica ausente" na review, não ele foi lá e criou.
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

trimmed=$(printf '%s' "$cmd" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

# Blanket anti-injeção: os branches abaixo usam glob (`*`) só pra permitir
# ARGUMENTOS depois do comando — sem isso, "git diff --stat; rm -rf /" bate
# no glob `"git diff "*` e passaria (achado real, testado manualmente antes
# deste guard). Qualquer metacaractere de shell no comando inteiro bloqueia,
# não importa o que mais bater depois. Usa grep (não um glob de `case` com os
# caracteres literais dentro) de propósito: embutir `;|&`$<>\` cru num
# padrão de `case` não citado é parseado pelo PRÓPRIO shell deste script
# antes do match acontecer — achado real, quebrava o bloqueio inteiro.
if printf '%s' "$trimmed" | grep -qE '[;|&`$<>\\]|[[:cntrl:]]'; then
  echo "bloqueado: metacaractere de shell não permitido em comando do code-reviewer." >&2
  echo "comando recebido: $trimmed" >&2
  exit 2
fi

case "$trimmed" in
  "git diff"|"git diff "*) exit 0 ;;
  "git log"|"git log "*) exit 0 ;;
  "bash scripts/check.sh") exit 0 ;;
  "bash scripts/e2e-spec-check.sh "*) exit 0 ;;
esac

echo "bloqueado: code-reviewer só pode rodar 'git diff', 'git log', 'bash scripts/check.sh' (sem argumento) ou 'bash scripts/e2e-spec-check.sh <spec>'." >&2
echo "comando recebido: $trimmed" >&2
echo "se a revisão precisa de verificação empírica que nenhum spec cobre ainda, registre isso como achado (cobertura ausente) — não escreva/rode nada fora dessa lista." >&2
exit 2
