---
description: Cria story decomposta em tickets a partir de uma análise aprovada; aguarda o gate G2 (História revisada) e só então cria a branch a partir de develop
argument-hint: [caminho da análise aprovada | descrição livre]
---

Entrada: $ARGUMENTS

Execute o **passo 2-3 do fluxo** (`docs/workflow.md`): criação de história e
decomposição em tickets.

Pré-condições (valide antes de qualquer coisa):
- Se a entrada for um arquivo em `work_progress/analysis/`, ele DEVE conter
  `[x] Análise aprovada`. Sem isso, pare e peça o G1.
- Se a entrada for descrição livre (demanda trivial que dispensa análise
  formal), siga — mas se a investigação revelar trade-offs reais, volte e rode
  `/analyze` primeiro.
- Working tree limpa; `develop` sincronizado com origin.

Passos (ainda em `develop` — **a branch só nasce depois do G2**, ver abaixo;
`work_progress/stories/` é gitignored, então rascunhar a story aqui não
suja `develop` nem exige commit nenhum):

1. Decida `tipo` (feat/fix/refactor/chore/...), `escopo` e `slug`.
2. Crie `work_progress/stories/YYYYMMDDHHmm_<slug>.md` seguindo a estrutura do
   `docs/workflow.md`, COMPLETA antes da revisão:
   - `## Contexto` e `## Solução` nunca em branco (importe da análise).
   - `## Tickets`: decomponha em unidades pequenas (alvo ≤ ~200 linhas de diff
     cada), com tabela (`#`, Descrição, Depende de, Status `[]`) e uma seção
     `### Tn — título` por ticket dizendo escopo, arquivos e critérios cobertos.
     Uma história com 1 ticket é válida; com mais de ~6, questione se não são
     duas histórias.
   - `## Critérios de Aceitação`: CA1 é SEMPRE
     `- [] CA1: Backend e frontend verdes (auto: scripts/check.sh)`.
     Cada CA seguinte referencia seu cenário:
     `- [] CAn: <critério> (auto: tests/functional/can_<slug>.sh)`.
     **Exceção (frontend):** se o critério já é (ou vira, neste ticket) um
     `describe('CAn: <critério>', ...)` dentro de um `*.test.tsx`/`.test.ts`,
     use `(auto: scripts/check.sh)` em vez de um script dedicado — a suíte
     inteira do CA1 já o cobre; não crie `tests/functional/canN_<slug>.sh`
     pra esse CA (ver "Testes funcionais" em `docs/workflow.md`).
   - `## Gates`:
     ```
     - [] História revisada
     - [] Review: APPROVED
     - [] Aprovado
     ```
   - Seções vazias `## Code Review` e `## Revisão` ao final.
3. **Escreva os cenários funcionais AGORA** — um `tests/functional/caNN_<slug>.sh`
   executável por CA (exceto CA1 e os CAs de frontend cobertos por
   `describe('CAn: ...')`, ver exceção acima), exit 0 = critério atendido. O
   navigator revisa os cenários junto com a story: eles fazem parte do que o
   G2 aprova. Cenário que ainda não pode passar (código não existe) deve
   FALHAR de forma clara, não dar erro de sintaxe. Esses arquivos SÃO
   versionados, mas ainda NÃO existe branch nem commit — ficam como untracked
   em `develop` até o passo 7 abaixo (nenhum problema: `develop` só é
   protegido contra commit/push direto, não contra arquivos soltos no
   working tree).
4. Apresente a story ao navigator e rode em background:
   `bash scripts/await-gate.sh revisao`
5. **Gate G2:** nenhuma branch nova, linha de código de produção ou teste
   unitário antes de `[x] História revisada`. Se a revisão pedir mudanças
   na story, edite o arquivo e mantenha o `await-gate.sh` rodando — ainda
   sem branch, sem custo de abandonar nada.

Após o G2 abrir:

6. **Só agora crie a branch** (sincronize `develop` de novo antes, caso a
   revisão tenha demorado): `git checkout -b <tipo>/<slug> develop`.
7. Execute o ciclo COMPLETO sem nenhum prompt ao navigator: para cada
   ticket em ordem de dependência —
red → green → refactor → `bash scripts/check.sh` → invocar o subagent
`code-reviewer` (passando story, Tn e o diff) → corrigir blocker/major e
re-invocar até `VERDICT: APPROVED` (máx. 3 iterações; estourou → escale ao
navigator com o resumo do impasse) → `bash scripts/record-review.sh <Tn> <iter>`
→ commit do ticket (`git add` seletivo; mensagem `tipo(escopo): Tn — descrição`;
o hook de commit exige o gate de review OK).
Ao final de todos os tickets: `bash scripts/functional-check.sh` →
`bash scripts/finalize-story.sh` → `scripts/push-pr.sh`.
