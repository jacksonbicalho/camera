---
description: Cria story decomposta em tickets a partir de uma análise aprovada; aguarda o gate G2 (História revisada) e só então cria a branch a partir de develop
argument-hint: [caminho da análise aprovada | descrição livre]
---

Entrada: $ARGUMENTS

Execute o **passo 2-3 do fluxo** (`docs/workflow.md`): criação de história e
decomposição em tickets.

**Passo 0 — antes de qualquer pré-condição ou investigação:** leia
`docs/workflow.md` por completo com a ferramenta Read, agora, mesmo que já
tenha lido em sessão anterior ou ache que lembra o conteúdo (a seção
"Artefatos" é o template exato usado no passo 3 abaixo).

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

1. **Liste `.claude/skills/` e invoque via `Skill` tool qualquer skill cujo
   domínio bata com a demanda** (ex.: mudanças de frontend →
   `composition-patterns`/`react-best-practices`/`web-design-guidelines`)
   — deixe o resultado informar a forma dos tickets e dos testes nomeados
   nos passos 3-4 abaixo. Nenhuma skill aplicável → siga sem invocar nada.
2. Decida `tipo` (feat/fix/refactor/chore/...), `escopo` e `slug`.
3. Crie `work_progress/stories/YYYYMMDDHHmm_<slug>.md` copiando o template
   `work_progress/stories/YYYYMMDDHHmm_<slug>.md` de `docs/workflow.md`
   (seção "Artefatos") **literalmente**, campo por campo —
   inclusive a linha `> Análise: work_progress/analysis/....md` quando a
   entrada veio de uma análise (é lida por script depois, char-a-char; um
   formato "equivalente" mas diferente, ex. prosa livre citando o caminho,
   já quebrou a limpeza automática). Se não tiver 100% de certeza do
   template exato, releia `docs/workflow.md` agora antes de escrever — não
   reproduza de memória. COMPLETA antes da revisão:
   - `## Contexto` e `## Solução` nunca em branco (importe da análise).
   - `## Tickets`: decomponha em unidades pequenas (alvo ≤ ~200 linhas de diff
     cada), com tabela (`#`, Descrição, Depende de, Issue `—`, Status `[]`) e uma seção
     `### Tn — título` por ticket dizendo escopo, arquivos e critérios cobertos.
     Uma história com 1 ticket é válida; com mais de ~6, questione se não são
     duas histórias.
   - `## Critérios de Aceitação`: CA1 é SEMPRE
     `- [] CA1: Backend e frontend verdes (auto: scripts/check.sh)`.
     **Todo CA é um teste nomeado dentro da suíte permanente correspondente
     — nunca um script `.sh` dedicado a um único CA** (mecanismo eliminado,
     ver "Testes funcionais" em `docs/workflow.md`). Anote
     `- [] CAn: <critério> (auto: <comando>)`, onde `<comando>` roda a suíte
     onde o teste nomeado vive: `scripts/check.sh` pra frontend
     (`describe('CAn: ...')`), Go (`t.Run("CAn: ...")`) e Python
     (`def test_caN_...()`). Uma única linha nunca tem mais de um
     `(auto: ...)` — se um CA precisar de 2 comandos distintos, é 2 CAs.
   - `## Gates`:
     ```
     - [] História revisada
     - [] Review: APPROVED
     - [] Aprovado
     ```
   - Seções vazias `## Code Review` e `## Revisão` ao final.
4. **Escreva os testes nomeados AGORA** (ou, se o CA exigir um script
   permanente novo em `scripts/`, escreva-o também) — exceto CA1. O
   navigator revisa junto com a story: fazem parte do que o G2 aprova. Um
   teste que ainda não pode passar (código não existe) deve FALHAR de forma
   clara, não dar erro de compilação/sintaxe. Esses arquivos SÃO
   versionados, mas ainda NÃO existe branch nem commit — ficam como untracked
   em `develop` até o passo 8 abaixo (nenhum problema: `develop` só é
   protegido contra commit/push direto, não contra arquivos soltos no
   working tree).
5. Apresente a story ao navigator e rode em background:
   `bash scripts/await-gate.sh revisao`
6. **Gate G2:** nenhuma branch nova, linha de código de produção ou teste
   unitário antes de `[x] História revisada`. Se a revisão pedir mudanças
   na story, edite o arquivo e mantenha o `await-gate.sh` rodando — ainda
   sem branch, sem custo de abandonar nada.

Após o G2 abrir:

7. **Só agora crie a branch** (sincronize `develop` de novo antes, caso a
   revisão tenha demorado): `git checkout -b <tipo>/<slug> develop`, seguido
   de `bash scripts/create-ticket-issues.sh <story>` — cria 1 Issue do
   GitHub por ticket da tabela (idempotente), gravando `#<numero>` na
   coluna `Issue`. A partir daqui `/act <numero da issue>` também pode
   retomar um ticket específico.
8. Execute o ciclo COMPLETO sem nenhum prompt ao navigator: para cada
   ticket em ordem de dependência —
red → green → refactor → `bash scripts/check.sh` → invocar o subagent
`code-reviewer` (passando story, Tn e o diff) → corrigir blocker/major e
re-invocar até `VERDICT: APPROVED` (máx. 3 iterações; estourou → escale ao
navigator com o resumo do impasse) → `bash scripts/record-review.sh <Tn> <iter>`
→ commit do ticket (`git add` seletivo; mensagem `tipo(escopo): Tn — descrição`;
o hook de commit exige o gate de review OK).
Ao final de todos os tickets: `bash scripts/functional-check.sh` →
`bash scripts/finalize-story.sh` → `scripts/push-pr.sh`.
