#!/bin/sh
# PreToolUse(Bash) hook — escopado ao subagent docs-writer (declarado no
# próprio .claude/agents/docs-writer.md, não em .claude/settings.json).
#
# Mesmo achado documentado em docs/workflow.md pro code-reviewer:
# `Bash(git push:*)` etc. no campo `tools:`/`disallowedTools:` do frontmatter
# de um agente NÃO restringe comando nenhum — sintaxe não suportada pela
# plataforma, ignorada silenciosamente (concede Bash irrestrito). Este hook
# é a restrição de comando real.
#
# Whitelist: só leitura de git (diff/log/show/status) — o docs-writer edita
# arquivos de documentação via Edit/Write (ferramentas próprias, não Bash),
# nunca commita/dá push/abre PR — isso é sempre o driver, depois de revisar
# o diff.
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

# Blanket anti-injeção: ver rationale idêntico em reviewer-bash-guard.sh —
# glob (`*`) nos branches abaixo só permite ARGUMENTOS depois do comando;
# sem este bloqueio, "git diff; rm -rf /" bateria no glob "git diff "* e
# passaria. grep (não case com os caracteres crus) de propósito, mesmo
# motivo documentado no guard irmão.
if printf '%s' "$trimmed" | grep -qE '[;|&`$<>\\]|[[:cntrl:]]'; then
  echo "bloqueado: metacaractere de shell não permitido em comando do docs-writer." >&2
  echo "comando recebido: $trimmed" >&2
  exit 2
fi

case "$trimmed" in
  "git diff"|"git diff "*) exit 0 ;;
  "git log"|"git log "*) exit 0 ;;
  "git show"|"git show "*) exit 0 ;;
  "git status"|"git status "*) exit 0 ;;
esac

echo "bloqueado: docs-writer só pode rodar 'git diff', 'git log', 'git show' ou 'git status' (leitura). Documentação é escrita via Edit/Write, nunca Bash; commit/push/PR são sempre o driver." >&2
echo "comando recebido: $trimmed" >&2
exit 2
