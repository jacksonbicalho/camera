#!/bin/sh
# SessionStart hook: injeta os guardrails do fluxo XP/TDD no contexto do Claude a
# cada início de sessão (versionado no repo, lido toda vez). Saída em JSON com
# hookSpecificOutput.additionalContext; se jq faltar, cai para texto puro (que o
# SessionStart também adiciona ao contexto).

guardrails=$(cat <<'EOF'
GUARDRAILS DO FLUXO (os-camera) — leia antes de agir:
→ LEIA `docs/workflow.md` no início da sessão — é o fluxo completo (análise, tickets, review automatizado, testes funcionais, release). O resumo abaixo é só a rede de segurança.
GATES HUMANOS — SÓ TRÊS: G1 análise aprovada · G2 história revisada · G3 release. Entre G2 e G3, NENHUM prompt ao navigator (única exceção: circuit breaker do code review após 3 iterações).
1. Demanda nova começa por /analyze → work_progress/analysis/*.md. GATE G1: nada de story/branch/código antes de `[x] Análise aprovada` — monitore com `scripts/await-gate.sh analise <arquivo>`.
2. /story cria story JÁ decomposta em tickets (T1..Tn) + todo CA verificado por um teste nomeado na suíte permanente correspondente (nunca script .sh dedicado a um CA) — AINDA EM develop, SEM branch. GATE G2: nem branch nem red phase antes de `[x] História revisada` — `scripts/await-gate.sh revisao`. Só depois do gate: `git checkout -b <tipo>/<slug> develop`.
3. Por ticket: TDD red → green → refactor. Testes via `bash scripts/check.sh` (nunca `go test`/`node` crus).
4. CODE REVIEW É DO SUBAGENT, NÃO DO NAVIGATOR: ao fim do TDD do ticket, invoque o subagent `code-reviewer` com o diff. CHANGES_REQUESTED → corrija blocker/major e re-invoque (máx. 3x; estourou → escale). APPROVED → `scripts/record-review.sh <Tn> <iter>` ANTES do commit — o hook de commit conta reviews: 1 APPROVED autoriza 1 commit.
5. CHECKBOXES: o driver NÃO marca CAs nem gates à mão. CA1 = check.sh; demais CAs = `scripts/functional-check.sh`; Review = record-review.sh; `[x] Aprovado` = `scripts/finalize-story.sh`. Humano marca só: Análise aprovada e História revisada.
6. Fim dos tickets: `functional-check.sh` → `finalize-story.sh` → commit final se houver → `scripts/push-pr.sh` (push+PR base develop+CI+merge) — direto, SEM perguntar. Story/análise/branch só somem com `[✓]` no release file.
7. `master` e `develop` são protegidos: nunca commit/push direto. Só o corte de release (`develop → master`, /release-pr) depende do navigator (G3).
EOF
)

if command -v jq >/dev/null 2>&1; then
  jq -n --arg ctx "$guardrails" \
    '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx}}'
else
  printf '%s\n' "$guardrails"
fi
