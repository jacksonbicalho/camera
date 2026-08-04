#!/bin/sh
# SessionStart hook: injeta os guardrails do fluxo XP/TDD no contexto do Claude a
# cada início de sessão (versionado no repo, lido toda vez). Saída em JSON com
# hookSpecificOutput.additionalContext; se jq faltar, cai para texto puro (que o
# SessionStart também adiciona ao contexto).

guardrails=$(cat <<'EOF'
GUARDRAILS DO FLUXO (os-camera):
→ LEIA `docs/workflow.md` POR COMPLETO antes de qualquer trabalho de fluxo (análise, story, tickets, review, release) — é a ÚNICA fonte de detalhe procedural do projeto. Releia se não tiver certeza de já conhecê-lo nesta sessão.
→ O que precisa sobreviver mesmo sem reler: só 3 gates humanos (G1 análise aprovada · G2 história revisada · G3 release — entre eles, zero prompts ao navigator); `master`/`develop` protegidos, nunca commit/push direto, tudo via PR; G3 só com ok explícito do navigator. Todo o resto (scripts, checkboxes automáticos, formato de story/análise, ciclo por ticket) está em `docs/workflow.md` — não reproduza de memória, releia.
EOF
)

if command -v jq >/dev/null 2>&1; then
  jq -n --arg ctx "$guardrails" \
    '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx}}'
else
  printf '%s\n' "$guardrails"
fi
