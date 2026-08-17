---
description: Retoma/inicia o ciclo TDD do ticket correspondente a um número de Issue do GitHub
argument-hint: <número da issue>
---

Entrada (número da issue): $ARGUMENTS

Execute o ciclo de um ticket específico — mesma mecânica do passo 7 de
`/story` (`docs/workflow.md`), só que retomado a partir do número de uma
Issue do GitHub em vez de seguir a ordem da tabela `## Tickets`.

**Passo 0:** leia `docs/workflow.md` por completo com a ferramenta Read,
agora, mesmo que já tenha lido em sessão anterior ou ache que lembra o
conteúdo.

Pré-condições (valide antes de qualquer coisa):
- Branch de história ativa (≠ `develop`/`master`) — este comando não cria
  branch nem story nova; ele retoma um ticket que já passou pelo G2 (as
  Issues só existem depois que `scripts/create-ticket-issues.sh` roda,
  logo após o G2).
- Working tree limpa, exceto por mudanças de um ticket já em andamento.

Passos:
1. Resolva a story da branch atual:
   `. scripts/lib/story.sh; story=$(resolve_story)`.
2. Resolva o ticket a partir do número da issue:
   `Tn=$(resolve_ticket_by_issue "$story" "$ARGUMENTS")`. Se vazio, pare e
   informe que nenhum ticket da story tem essa Issue registrada — não
   adivinhe qual ticket o navigator quis dizer.
3. Se o ticket já está `[x]` na tabela `## Tickets` (já commitado e
   aprovado), informe isso e pare — não há nada a retomar.
4. Execute o ciclo do ticket exatamente como o passo 7 de `/story`: TDD
   red → green → refactor → `bash scripts/check.sh` → invoca o subagent
   `code-reviewer` (story, Tn, diff) → `CHANGES_REQUESTED` (corrige
   blocker/major, re-invoca, máx. 3 iterações, senão escala ao navigator
   com o resumo do impasse) ou `APPROVED`
   (`scripts/record-review.sh <Tn> <iterações>` → commit do ticket,
   `git add` seletivo, mensagem `tipo(escopo): Tn — descrição`; o hook de
   commit exige o gate de review OK).
5. Se esse era o último ticket pendente da história, siga o restante do
   fluxo normalmente a partir daqui (`functional-check.sh` →
   `finalize-story.sh` → subagent `docs-writer` → `commit.sh` → resumo em
   `## Revisão` → `await-gate.sh prepush`), sem perguntar nada — mesmo
   comportamento de sempre entre G2 e o pré-push. Caso contrário, pare
   aqui: os demais tickets seguem seu curso normal via `/story` ou via
   novas invocações de `/act`.
