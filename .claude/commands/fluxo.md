---
description: Lê o fluxo de trabalho completo (docs/workflow.md + seção de fluxo/gates do CLAUDE.md) e confirma o entendimento
---

Carregue e internalize **todo o fluxo de trabalho combinado** deste projeto antes de agir. Este comando não inicia nenhuma história nem executa nenhuma ação — só lê e resume.

## Passos

1. **Leia integralmente `docs/workflow.md`** com a ferramenta Read (é a fonte canônica: XP/TDD, estratégia de branches, CI/branch protection, ciclo por história com os gates, slash commands, hooks, scripts de workflow e planejamento/corte de release). Leia o arquivo inteiro, não só um trecho.

2. **Releia, no `CLAUDE.md`, a seção "Fluxo de trabalho"** (resumo + **"Regras-gate inegociáveis"**) — é o ponteiro canônico que complementa o `docs/workflow.md`.

3. **Confirme o entendimento** devolvendo um resumo curto (bullets) dos pontos-gate, sem reabrir discussão e sem começar tarefa nenhuma:
   - Só **3 gates humanos**: G1 (Análise aprovada), G2 (História revisada), G3 (release). Entre G2 e G3, zero prompts ao navigator (exceção: circuit breaker do code review após 3 iterações).
   - **G1:** demanda com trade-offs reais começa por `/analyze` → `work_progress/analysis/*.md`; nada de story/código antes de `[x] Análise aprovada`.
   - **G2:** `/story` escreve, ainda em `develop` (sem branch), a story já decomposta em tickets (T1..Tn) + 1 cenário funcional por CA em `tests/functional/`. Não implementar (nem red phase) antes de `[x] História revisada`. Só depois do gate: `git checkout -b <tipo>/<slug> develop`.
   - Por ticket, sem interação: TDD red → green → refactor → `bash scripts/check.sh` → subagent `code-reviewer` (`CHANGES_REQUESTED` corrige e re-invoca, máx. 3x; `APPROVED` → `scripts/record-review.sh <Tn> <iter>` → commit do ticket).
   - **Checkboxes automáticos, nunca à mão:** CA1 = `check.sh`; demais CAs = `scripts/functional-check.sh`; `Review: APPROVED` = `record-review.sh`; `[x] Aprovado` = `scripts/finalize-story.sh`.
   - Ao final: `scripts/commit.sh` (se pendente) → `scripts/push-pr.sh` (push + PR base `develop` + CI + merge), direto e sem perguntar.
   - Monitorar gates com `scripts/await-gate.sh {analise|revisao|aprovado}` rodando em background **rastreado pelo harness** (`run_in_background`), não `nohup`.
   - `master` e `develop` são protegidos — nunca commit/push direto; tudo via PR. **G3:** o corte de release (`develop → master`, via `scripts/release-pr.sh`) só com ok explícito do navigator.

## Restrição

- **Não** crie story, branch, nem rode scripts de workflow ao executar este comando. O objetivo é só carregar o fluxo no contexto e confirmar que está alinhado.
