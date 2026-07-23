# Fluxo de trabalho — desenvolvimento e publicação

> Fluxo completo do projeto (XP/TDD, análise, tickets, code review automatizado, testes funcionais, branches, CI, release).
> Referenciado pelo `CLAUDE.md` e lido no início da sessão (hook `session-start`).

O desenvolvimento segue **XP (Extreme Programming)** com **TDD red → green → refactor**, com **3 gates humanos** (+ 1 pausa fixa pré-push, ver abaixo) — o resto do ciclo roda sozinho:

- O **navigator** (usuário) aprova a análise, aprova a história (com seus tickets e testes funcionais), testa a branch antes do push e libera o release.
- O **driver** (Claude) investiga, planeja, implementa, revisa (via subagent) e publica — sem interromper o navigator entre os gates, exceto pela pausa pré-push.

```mermaid
flowchart TD
    A["1. /analyze<br/>Análise técnica automática"] --> G1["Gate 1 — você aprova análise"]
    G1 --> B["2. /story + 3. tickets<br/>História e decomposição"]
    B --> G2["Gate 2 — você aprova tickets"]
    G2 --> C["4. Implementação TDD<br/>red, green, refactor por ticket"]
    C --> D["5-6. Code review (subagent)<br/>Ajustes em loop, sem você"]
    D -.-> C
    D --> E["7. Testes funcionais<br/>Um cenário por critério"]
    E --> P["Pré-push — checkbox '## Revisão' na story<br/>você testa e marca [x], ou escreve o problema e deixa em branco"]
    P -.-> C
    P --> G3["Gate 3 — você libera release"]
```

> ⚠️ **`master` e `develop` são protegidos.** Push direto é bloqueado em ambos. Features entram via PR para `develop`; o PR `develop → master` acontece apenas no momento de release. Nunca commite ou force-push diretamente em nenhum dos dois.

### Gates humanos (únicos pontos de interação do navigator)

| Gate | Onde | O que o navigator faz |
|------|------|------------------------|
| **G1 — Análise aprovada** | `work_progress/analysis/*.md` → `[x] Análise aprovada` | Aprova a *direção* (problema + solução escolhida) |
| **G2 — História revisada** | `work_progress/stories/*.md` → `[x] História revisada` | Aprova story **e tickets** (e os cenários funcionais) de uma vez |
| **Pré-push** | `work_progress/stories/*.md`, seção `## Revisão` → `[x] Pré-push: revisado e aprovado` | Testa a história (manualmente, na branch) e marca o checkbox pra liberar o push — sem marcar, **push-pr.sh não roda, nunca** |
| **G3 — Release** | `/release-pr` + aprovação do PR develop→master | Libera o corte de release |

**Tudo entre G2 e G3 roda sozinho:** implementação, code review (subagent), ajustes, testes funcionais, commit. Duas exceções: o *circuit breaker* do code review (3 iterações sem `APPROVED` num ticket escalam ao navigator) e a **pausa antes de `push-pr.sh`** — regra permanente (não específica de uma história): o driver nunca dá push/abre PR sem o navigator ter testado a branch e aprovado explicitamente primeiro. Commits por ticket continuam automáticos; só o `push-pr.sh` final espera esse ok.

### Estratégia de branches

```
master   ← PRs de release (develop → master)
  ↑
develop  ← PRs de feature/fix/chore
  ↑
feat/xyz · fix/abc · chore/def  ← branches de história
```

- Branches de história partem **sempre de `develop`**: `git checkout -b <tipo>/<desc> develop`
- PRs de história têm **`develop` como base**: `gh pr create --base develop`
- PRs de release têm **`master` como base**: `gh pr create --base master --head develop`
- **Ciclo de vida da branch:** deletada imediatamente após o merge em `develop` — remoto automaticamente pelo GitHub, local com `git branch -d <branch>` no passo de merge em lote.

### CI e branch protection

Todo PR para `master` ou `develop` dispara `.github/workflows/ci.yml` com dois jobs paralelos:
- **Backend**: `go test ./...` + `go build ./...`
- **Frontend**: `yarn lint` + `yarn test --run` + `yarn build`

Ambos os branches estão protegidos: push direto bloqueado, PR obrigatório, checks `Backend` e `Frontend` obrigatórios. `master` exige 1 aprovação humana; `develop` não exige aprovação (projeto solo — CI já é a barreira de qualidade). Para reaplicar as regras (ex: em novo repositório):

```bash
# master — só aceita PRs vindos de develop (releases); exige 1 aprovação humana
gh api repos/{owner}/{repo}/branches/master/protection \
  --method PUT \
  --header "Accept: application/vnd.github+json" \
  --input - <<'EOF'
{
  "required_status_checks": { "strict": true, "contexts": ["Backend", "Frontend"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "dismiss_stale_reviews": true, "required_approving_review_count": 1 },
  "restrictions": null
}
EOF

# develop — aceita PRs de feature branches; CI obrigatório, sem aprovação humana
gh api repos/{owner}/{repo}/branches/develop/protection \
  --method PUT \
  --header "Accept: application/vnd.github+json" \
  --input - <<'EOF'
{
  "required_status_checks": { "strict": true, "contexts": ["Backend", "Frontend"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "dismiss_stale_reviews": true, "required_approving_review_count": 0 },
  "restrictions": null
}
EOF
```

### Fluxo por demanda

> ⚠️ **OBRIGATÓRIO:** Antes de escrever qualquer linha de código ou teste, o driver DEVE passar por `/analyze` (quando a demanda tiver trade-offs reais) e por `/story` (story file revisada no G2, branch só depois). Sem exceção — nem para bugs simples, nem para "pequenas correções" (nesses casos a análise pode ser breve, mas existe).

```
demanda livre
   │
   ▼
/analyze ──► work_progress/analysis/YYYYMMDDHHmm_<slug>.md
   │              (problema, opções, decisão, impacto)
   ▼
[G1] navigator marca [x] Análise aprovada        ◄── scripts/await-gate.sh analise
   │
   ▼
/story ──► work_progress/stories/YYYYMMDDHHmm_<slug>.md   (ainda em develop, sem branch)
   │         story JÁ decomposta em tickets T1..Tn
   │         + 1 cenário funcional por critério (tests/functional/)
   ▼
[G2] navigator marca [x] História revisada       ◄── scripts/await-gate.sh revisao
   │
   ▼
git checkout -b <tipo>/<slug> develop   (branch só nasce AGORA, pós-G2)
   │
   ▼  (loop por ticket, sem interação)
┌─────────────────────────────────────────────┐
│ para cada ticket Tn:                         │
│   red → green → refactor (TDD)               │
│   bash scripts/check.sh                      │
│   invoca subagent code-reviewer              │
│   ├─ CHANGES_REQUESTED → corrige → re-invoca │
│   │   (máx. 3 iterações; estoura → escala    │
│   │    ao navigator)                         │
│   └─ APPROVED → scripts/record-review.sh Tn  │
└─────────────────────────────────────────────┘
   │
   ▼
bash scripts/functional-check.sh   → roda cenários, marca CAs [x]
bash scripts/finalize-story.sh     → se tudo verde: marca [x] Aprovado
   │
   ▼
scripts/commit.sh (se pendente)
   │
   ▼
Preenche o resumo em `## Revisão` da story
   │
   ▼
bash scripts/await-gate.sh prepush   (background — mesmo padrão de G1/G2)
   │
   ▼
[Pré-push] navigator testa a branch, marca `[x] Pré-push: revisado e aprovado`
           (ou escreve os problemas encontrados em `## Revisão` e deixa desmarcado —
           o driver lê, corrige, atualiza o resumo e volta a aguardar o MESMO checkbox)
   │        ◄── PARE aqui: push-pr.sh NUNCA roda sem esse checkbox marcado
   ▼
scripts/push-pr.sh   (push+PR+CI+merge)
   │
   ▼
[G3] /release-pr quando o navigator liberar (inalterado)
```

1. **`/analyze <demanda>`** investiga o código (nunca pergunta o que o código já responde), resolve ambiguidade genuína via `AskUserQuestion` **antes** de escrever, e produz `work_progress/analysis/YYYYMMDDHHmm_<slug>.md` (Problema/Investigação/Opções/Decisão recomendada/Impacto). Roda `scripts/await-gate.sh analise <arquivo>` em background e, ao abrir, segue direto para `/story` — sem perguntar nada.
2. **`/story [análise|descrição livre]`** escreve a story **completa** (Contexto/Solução nunca em branco) **já decomposta em tickets** — ver estrutura abaixo — e escreve os **cenários funcionais agora** (antes do G2, para o navigator revisar junto), tudo ainda em `develop` — **sem criar branch nenhuma** (`work_progress/stories/` é gitignored; os cenários funcionais ficam untracked até o commit do 1º ticket). Roda `scripts/await-gate.sh revisao` em background.
3. **Gate G2.** Nenhuma branch nova, linha de código de produção ou teste antes de `[x] História revisada` — evita o custo de abandonar uma branch se a revisão pedir mudanças grandes na story.
4. **Só então:** `git checkout -b <tipo>/<slug> develop` (sincronizado de novo, caso a revisão tenha demorado).
5. **Ciclo por ticket (sem nenhum prompt ao navigator):** TDD red → green → refactor → `bash scripts/check.sh` → invoca o subagent `code-reviewer` → `CHANGES_REQUESTED` (corrige blocker/major, re-invoca, máx. 3 iterações, senão escala) ou `APPROVED` (`scripts/record-review.sh <Tn> <iterações>`, então commit do ticket).
6. **Fim dos tickets:** `bash scripts/functional-check.sh` (roda os cenários, marca os CAs) → `bash scripts/finalize-story.sh` (marca `[x] Aprovado` quando História revisada + Review APPROVED + todos os CAs estão verdes) → `scripts/commit.sh` (se houver algo pendente) → preenche o resumo em `## Revisão` da story → `bash scripts/await-gate.sh prepush` em background (mesmo padrão de G1/G2) → **PARA e aguarda o navigator marcar `[x] Pré-push: revisado e aprovado`** (checkbox na seção `## Revisão` da story — regra permanente, gate de verdade, nunca rodar `push-pr.sh` sem ele marcado, mesmo com a story `[x] Aprovado`) → só então `scripts/push-pr.sh` (push + PR **sempre `--base develop`** + aguarda CI + merge quando verde). Se o navigator encontrar problemas em vez de aprovar, ele escreve o que encontrou na própria seção `## Revisão` e **deixa o checkbox desmarcado** — o driver lê o feedback (aparece no diff do arquivo), corrige (voltando ao ciclo normal de ticket — TDD → `check.sh` → subagent `code-reviewer` → commit — se a correção mexer em lógica de produção), atualiza o resumo e volta a aguardar o MESMO checkbox. **CI vermelho:** o `push-pr.sh` propaga o erro sem mergear (PR fica aberto) — **Política A**: um fix trivial pós-`Aprovado` (deixar o CI verde) não exige nova aprovação; se o fix mexer em lógica de produção, volta pro ciclo de ticket (novo review do subagent).
7. Atualizar o arquivo de release correspondente em `work_progress/releases/`: preencher a branch e o número do PR na tabela, marcar `[~]`; o `merge-when-green.sh` marca `[~]→[✓]` ao mergear em `develop`. **Apenas o corte de release** (`develop → master`, G3) depende de autorização explícita do navigator.

### Artefatos

#### `work_progress/analysis/YYYYMMDDHHmm_<slug>.md` (gitignored, como `work_progress/stories/`)

```markdown
# Análise — <título curto>

## Problema
## Investigação
(arquivos relevantes, comportamento atual, causa raiz)
## Opções
1. ... (prós/contras)
2. ...
## Decisão recomendada
## Impacto
(módulos afetados, riscos, migrações, estimativa de decomposição em tickets)

## Gate
- [] Análise aprovada
```

#### `work_progress/stories/YYYYMMDDHHmm_<slug>.md`

```markdown
# tipo(escopo): descrição curta em inglês

> Análise: work_progress/analysis/YYYYMMDDHHmm_<slug>.md

## Contexto
## Solução

## Tickets
| # | Descrição | Depende de | Status |
|---|-----------|------------|--------|
| T1 | ... | — | [] |
| T2 | ... | T1 | [] |

### T1 — título
Escopo, arquivos, abordagem. Critérios cobertos: CA2.

## Critérios de Aceitação
- [] CA1: Backend e frontend verdes (auto: scripts/check.sh)
- [] CA2: <critério> (auto: tests/functional/ca2_<slug>.sh)
- [] CA3: <critério> (auto: tests/functional/ca3_<slug>.sh)

## Gates
- [] História revisada
- [] Review: APPROVED
- [] Aprovado

## Code Review
(preenchido por scripts/record-review.sh)

## Revisão
(resumo do driver ao final, como hoje)

- [] Pré-push: revisado e aprovado
```

O checkbox `Pré-push: revisado e aprovado` é o gate da pausa pré-push (ver
"Gates humanos" acima) — **nunca marcado pelo driver**, só pelo navigator,
depois de testar a branch de verdade. Monitorado via `scripts/await-gate.sh
prepush` exatamente como os outros gates (G1/G2). Se o navigator encontrar
problemas em vez de aprovar, escreve o que encontrou ali mesmo (na própria
seção `## Revisão`, substituindo/complementando o resumo do driver) e
**deixa o checkbox desmarcado** — o driver lê o feedback (aparece no diff
do arquivo), corrige (voltando ao ciclo normal de ticket se a correção
mexer em lógica de produção) e atualiza o resumo, aguardando de novo o
mesmo checkbox. **`push-pr.sh` nunca roda sem esse checkbox marcado** —
regra permanente, sem exceção.

Regras:
- **Todo critério de aceite tem um cenário funcional executável** em `tests/functional/caNN_<slug>.sh` (exit 0 = passou), exceto o CA1 (`scripts/check.sh`). Escrito pelo driver **antes** do G2 — o navigator revisa os cenários junto com a story. **Exceção:** um CA de **frontend** cuja verificação já é um `describe('CAX: <critério>', ...)` dentro do próprio `*.test.tsx`/`.test.ts` (ver "Testes funcionais" abaixo) usa `(auto: scripts/check.sh)` em vez de um script dedicado — a suíte inteira (CA1) já o cobre; o code review confirma que o describe existe e corresponde ao critério.
- `[x] Review: APPROVED` só é escrito por `record-review.sh` (todos os tickets aprovados pelo subagent).
- `[x] Aprovado` só é escrito por `finalize-story.sh` (nunca pelo driver à mão) quando: História revisada ✓ + Review APPROVED ✓ + todos os CAs ✓. Isso mantém `commit.sh`/`push-pr.sh`/hooks funcionando sem alteração de contrato.
- `[x] Pré-push: revisado e aprovado` (seção `## Revisão`) só é marcado pelo NAVIGATOR, nunca pelo driver — é o único gate cujo checkbox não é preenchido por nenhum script. `scripts/push-pr.sh` nunca roda sem ele marcado, mesmo com a story já `[x] Aprovado`.

Histórias e análises ficam em `work_progress/stories/`/`work_progress/analysis/` (subdiretórios do diretório único `work_progress/`, gitignored — ver `CLAUDE.md`). O nome do arquivo usa timestamp no formato `YYYYMMDDHHmm_<descricao>.md` — igual às migrations de banco — garantindo ordenação cronológica natural ao listar o diretório.

### Tickets

- Vivem **dentro da story** (não são GitHub Issues): projeto solo, o release file já dá a visão agregada; Issues adicionariam latência e estado duplicado.
- Um ticket = uma unidade implementável com TDD próprio, idealmente ≤ ~200 linhas de diff. Cada ticket vira **um commit** na branch da história (mensagem: `tipo(escopo): T1 — descrição`); o PR continua um por história.
- Se durante a implementação um ticket se revelar maior que o previsto, o driver o divide (T2 → T2a/T2b) atualizando a tabela — sem novo gate.
- Uma história com 1 ticket é válida; com mais de ~6, questione se não são duas histórias.

### Code review automatizado

Subagent `code-reviewer` (`.claude/agents/code-reviewer.md`): contexto limpo, só leitura (`Read, Grep, Glob, Bash(git diff:*), Bash(git log:*), Bash(bash scripts/check.sh)`), lê o diff do ticket + arquivos tocados, devolve veredito estruturado. Nunca edita arquivos nem marca checkboxes.

Loop por ticket:
1. Driver termina o TDD do ticket e roda `bash scripts/check.sh`.
2. Driver invoca o subagent passando: story, ticket, `git diff` staged/HEAD.
3. Veredito `CHANGES_REQUESTED` → driver corrige apenas issues `blocker` e `major` (registra `minor`/`nit` na seção Code Review como follow-up) e re-invoca.
4. Veredito `APPROVED` → `scripts/record-review.sh <Tn> <iterações>`.
5. **Circuit breaker:** 3 iterações sem `APPROVED` → driver para, resume o impasse na seção Code Review e escala ao navigator (única exceção de interação entre G2 e G3).

### Testes funcionais

- `tests/functional/` (versionado). Convenção: `caNN_<slug>.sh`, executável, exit 0 = critério atendido. Pode chamar `go test -run`, `curl` contra o binário, `yarn test --testNamePattern`, etc. — o contrato é só o exit code. Ver template em `tests/functional/ca2_exemplo.sh.template`.
- `scripts/functional-check.sh`: roda `check.sh` (marca CA1) e depois cada `caNN_*.sh` referenciado na story, marcando `[x]` no CA correspondente ao passar. Falhou → CA fica `[]` e o script sai com erro (driver corrige e re-roda; se a correção mexer em lógica, o ticket volta ao loop de review).
- **CAs de frontend sem script dedicado:** critério cuja verificação já existe como `describe('CAX: <critério>', () => it('<comportamento>', ...))` dentro de um `*.test.tsx`/`.test.ts` é anotado `(auto: scripts/check.sh)` em vez de `tests/functional/caNN.sh` — `functional-check.sh` marca `[x]` esses CAs direto (já cobertos pela suíte inteira do CA1), sem rodar nada além do `check.sh` do topo. Existe porque um script dedicado nesses casos só reproduzia o mesmo `yarn test -t '<padrão>'` + `grep 'passed'` (workaround pro Vitest não falhar quando `-t` não casa nenhum teste) repetido dezenas de vezes; a garantia real do critério é o `describe`/`it` existir no código E a suíte inteira estar verde — verificável por code review, não por script. Convenção adotada na história `refactor/frontend-testes-ca-describe` (`work_progress/analysis/202607232012_frontend-testes-ca-describe.md`).
- Substitui o antigo `story-approval.sh` interativo: critério verificável por máquina é marcado pela máquina. Critério genuinamente não-automatizável deve ser questionado no G1/G2 — ou vira automatizável, ou não é critério.

### Commits semânticos

Formato: `<tipo>(<escopo opcional>): <descrição curta em inglês>` — para tickets, `<tipo>(<escopo>): Tn — <descrição>`.

| Tipo | Quando usar |
|---|---|
| `feat` | nova funcionalidade |
| `fix` | correção de bug |
| `refactor` | refatoração sem mudança de comportamento |
| `test` | adição ou correção de testes |
| `docs` | documentação |
| `chore` | configuração, build, dependências |

### Slash commands

O fluxo acima é automatizado pelos slash commands em `.claude/commands/`:

| Comando | O que faz |
|---|---|
| `/analyze <demanda livre>` | Investiga e produz `work_progress/analysis/*.md`; aguarda o gate G1. |
| `/story [análise\|descrição livre]` | Cria story decomposta em tickets (ainda em `develop`, sem branch); aguarda o gate G2; após G2, cria a branch a partir de `develop` e roda o ciclo completo até parar pra você testar e aprovar o push (`push-pr.sh` só roda depois desse ok). |
| `/release-pr [vX.Y.Z]` | Valida release file e abre PR develop → master (após todas as histórias `[✓]`). |
| `/release-tag` | Roda `./scripts/release.sh` em master após o PR de release ser mergeado. |

Use os commands em vez de executar os passos manualmente — eles validam pré-condições e evitam erros (branch errada, working tree suja, status incompleto).

### Hooks de pre-commit (`.claude/settings.json`)

Hooks `PreToolUse` (matcher `Bash`, versionados no repo) impõem o fluxo automaticamente. O `settings.json` só **chama scripts** versionados em `scripts/hooks/` (a lógica vive lá, não inline):

| Gate | Script | Bloqueia quando |
|---|---|---|
| Aprovação por ticket | `scripts/hooks/story-approved.sh` | `git commit` em branch de história sem `[x] História revisada`, ou quando o nº de commits já feitos na branch ≥ nº de tickets com `APPROVED` registrado (modo legado: libera tudo se `[x] Aprovado` já estiver marcado). |
| Target do PR | `scripts/hooks/pr-target.sh` | `gh pr create --base master` a partir de branch que não seja `develop`/`release/*`. |
| Testes backend | `scripts/hooks/precommit-tests.sh` | `git commit` quando `go build ./...` ou `go test -count=1 ./...` falham. |

O gate de testes roda no host (Go instalado), **sem cache** (`-count=1`) — só execução limpa pega testes dependentes de `time.Now()` (o cache do Go não rastreia o relógio). Escopo é backend; o frontend segue coberto pelo CI. Hooks só recarregam no início da sessão do Claude Code: alterações em `settings.json` (ou nos scripts de hook) valem a partir da próxima sessão.

### Scripts de workflow (`scripts/`)

Encadeiam o fluxo por história. **Checkboxes usam `[]` para não-marcado** (e `[x]` para marcado).

| Script | Quem roda | O que faz |
|---|---|---|
| `check.sh` | Claude | "CI local": `go build`+`go test` sempre; `frontend-check.sh` se `frontend/` mudou (vs develop). Se tudo verde, marca o **CA1** da story `[x]`. |
| `lib/story.sh` | (lib) | `resolve_story` (story pela branch atual), `checkbox_marked`/`mark_checkbox` — compartilhados por todos os scripts abaixo. |
| `await-gate.sh {analise\|revisao\|aprovado} [arquivo]` | Claude (background) | Bloqueia até o gate correspondente abrir (padrão ancorado, case-insensitive, imune a menções na prosa). `analise` = G1 em `work_progress/analysis/*.md`; `revisao` = G2 na story; `aprovado` = modo legado (todos os CAs + `[x] Aprovado`). |
| `record-review.sh <Tn> <iterações>` | Claude | Registra o veredito `APPROVED` do subagent `code-reviewer` na seção `## Code Review`, marca o Status do ticket na tabela, e abre `Review: APPROVED` quando todos os tickets estão `[x]`. |
| `functional-check.sh` | Claude | Roda `check.sh` (CA1) + cada cenário `tests/functional/caNN_*.sh` referenciado na story, marcando cada CA `[x]` ao passar. |
| `finalize-story.sh` | Claude | Marca `[x] Aprovado` automaticamente quando História revisada + Review APPROVED + todos os CAs estão verdes — nunca marcado à mão pelo driver. |
| `commit.sh` | Claude | Commita o que está staged usando o heading `#` da story (ou `Tn — descrição` do ticket) como mensagem; exige o gate do hook `story-approved.sh`; adiciona `Co-Authored-By`. |
| `push-pr.sh` | Claude | **Orquestra o ciclo pós-aprovação:** push + `gh pr create --base develop` + **registra a linha da história no `_next.md` com `[~]`** (idempotente por `#PR`) + aguarda o CI e mergeia (chama `merge-when-green.sh`). Só com tree limpa + story aprovada; idempotente (não recria PR; re-roda após fix). `--no-merge` só abre o PR sem mergear. CI vermelho: propaga erro sem mergear. |
| `release-pr.sh [versão]` | Claude (via `/release-pr`) | **Corte de release:** valida o `_next.md` (todas `[✓]`) + pré-condições git (develop sincronizado, tree limpa, à frente de master), calcula a versão estimada (bump convencional) e abre o PR `develop → master`. Idempotente (PR aberto → mostra URL). **Não mergeia** (master exige aprovação humana). |
| `release-candidate.sh` | Navigator (manual) | **Pré-release (RC) sem tocar em master:** roda a partir de `develop`, calcula a próxima versão (via `release.sh --print-next-version`) e cria/sobrescreve a tag flutuante `vX.Y.Z-rc` (`git push --force`) — dispara o mesmo `release.yml`, publicando binários + imagem Docker como pré-release do GitHub. `--dry-run` só mostra a tag; `--cleanup` remove a RC do ciclo atual. |

### Merge pós-PR

`scripts/merge-when-green.sh <PR#>` colapsa o ciclo pós-PR numa única invocação (economia de tokens): aguarda o CI em silêncio, mergeia em `develop`, sincroniza o branch local e marca `[~]→[✓]` na linha do PR no release file que a contém (busca por conteúdo — funciona com `_next.md` e `_vX.Y.Z.md`). **Só remove o story file (+ a análise vinculada, se houver) e deleta a branch da história QUANDO a marcação `[✓]` teve sucesso** — se a linha não existir no release file, preserva branch, story e análise (nada se perde). Imprime só o resumo. **Recusa** PRs com base `master` (releases são aprovadas à mão) e é idempotente em PR já mergeado. É a primitiva chamada pelo `push-pr.sh` ao final, mas também pode ser invocada avulsa (ex.: retomar após um fix de CI num PR já aberto).

> ⚠️ **Limpeza gated em `[✓]`:** o story file (`work_progress/stories/`), a análise que a originou (`work_progress/analysis/`, lida da linha `> Análise: ...` no cabeçalho da story — só existe quando houve G1) e a branch da história só são apagados quando a história está `[✓]` no release file. Como o `push-pr.sh` registra a linha com `[~]` ao abrir o PR e o `merge-when-green.sh` a marca `[✓]` ao mergear, isso roda sozinho — o driver **não edita mais o `_next.md` à mão**.

`scripts/release-tag.sh [--dry-run]` colapsa o **corte de release** (após o PR develop→master já mergeado): cria/envia a tag via `release.sh` (confirmação automática), aguarda o workflow Release publicar **em silêncio** (poll de `gh release view`), mergeia `master→develop` (passo pós-tag), **rotaciona o release file** (chama `rotate-release-next.sh`) e imprime uma linha (`RELEASED <versão> | assets: N | develop sincronizado | release file rotacionado`). `--dry-run` só mostra a versão que sairia. Substitui o ciclo manual com `gh run watch`.

`scripts/rotate-release-next.sh <version>` opera só sobre `work_progress/releases/` (sem git/gh; testável via `RELEASES_DIR`): no corte, **(a)** carimba o `*_next.md` atual com `Publicada: <version>` e o renomeia para `<timestamp>_<version>.md` (cada arquivo = uma release publicada) e **(b)** cria um novo `<agora>_next.md` com `Base: <version>` (a recém-publicada) no topo. Chamado pelo `release-tag.sh`.

### Release

```bash
./scripts/release.sh             # calcula bump, gera changelog, cria tag anotada e faz push
./scripts/release.sh --dry-run   # prévia sem criar nada
```

O script lê os commits convencionais desde a última tag, determina o bump (`feat` → minor, breaking → major, resto → patch), gera o changelog agrupado por tipo e cria uma tag no formato `vX.Y.Z-dev`. O push da tag dispara o GitHub Actions que publica a release. O sufixo `-dev` indica projeto em desenvolvimento ativo; quando atingir estabilidade, as tags passarão a usar `vX.Y.Z` sem sufixo.

#### Pré-release / release candidate (sem tocar em master)

Pra testar o binário/imagem Docker de um ciclo em andamento **antes** de cortar a release de verdade (sem tocar em `master`), use `scripts/release-candidate.sh` a partir de `develop`:

```bash
./scripts/release-candidate.sh            # cria/atualiza a -rc da versão atual
./scripts/release-candidate.sh --dry-run  # só mostra a tag que seria criada/atualizada
./scripts/release-candidate.sh --cleanup  # apaga a -rc do ciclo atual (release real já saiu)
```

O workflow `release.yml` dispara em **qualquer** tag `v*` enviada, não só as que apontam pra `master` — então uma pré-release funciona no mesmo pipeline da release de verdade, só marcada como *pre-release* no GitHub (o passo "Detect pre-release" reconhece o sufixo `-rc`/`-beta`/`-alpha`). Isso importa porque o auto-updater embutido no app (`internal/release/checker.go`) só consulta `/releases/latest`, que a API do GitHub **nunca** devolve como pré-release — instalações existentes nunca são notificadas/atualizadas pra uma RC.

**Tag fixa por ciclo** (`vX.Y.Z-rc`, sem número incremental): cada chamada sobrescreve a mesma tag (`git push --force`). O `softprops/action-gh-release` faz upsert por nome de tag — atualiza a release existente em vez de criar outra, então só existe uma entrada de pré-release por versão sendo testada (evita entupir a lista de Releases a cada tentativa). Quando a versão real sai, `release-tag.sh` já remove (melhor esforço) a `-rc` correspondente sozinho.

**Instalar uma `-rc`** não exige nada especial — os assets de pré-release ficam acessíveis normalmente (só o atalho `/latest/download/` é que pula pré-releases):

```bash
# binário direto
curl -LO https://github.com/jacksonbicalho/os-camera/releases/download/v1.4.0-rc/camera-linux-amd64

# imagem Docker (a tag preserva o sufixo -rc, é semver válido)
docker pull jacksonbicalho/os-camera:1.4.0-rc
```

#### Planejamento de release (work_progress/releases/)

`work_progress/releases/` (gitignored) agrupa histórias em uma release antes de mergeá-las.

**Fluxo:**
1. O arquivo de planejamento se chama **`work_progress/releases/YYYYMMDDHHmm_next.md`** (sem versão — o bump só é conhecido no corte). As histórias planejadas entram nele. No corte, o `rotate-release-next.sh` (via `release-tag.sh`) carimba esse `_next.md` com a versão publicada, renomeia para `<timestamp>_<version>.md` e abre um `_next.md` novo já com `Base: <version>` no topo. **Nunca nomear o arquivo de planejamento com a versão na frente.**
2. Ao concluir cada história, preencher branch e PR na tabela e marcar `[~]` (aguardando aprovação no GitHub — PR targeta `develop`).
3. Após aprovação no GitHub, marcar `[x]`.
4. Quando todas estiverem `[x]`, o navigator diz **"pode mergear a release"** — Claude itera a lista, mergeia cada PR em `develop` em sequência, deleta a branch local (`git branch -d <branch>`) e marca `[✓]`. O GitHub deleta a branch remota automaticamente após o merge (setting "Automatically delete head branches" ativo).
5. Após todos os merges em `develop`, Claude abre um PR `develop → master` via **`scripts/release-pr.sh`** (`/release-pr`) — valida o release file e as pré-condições e cria o PR `release: vX.Y.Z`.
6. Após aprovação e merge do PR de release, Claude roda `./scripts/release.sh` para gerar a tag.
7. **Após a tag ser criada**, mergear `master` de volta em `develop` para que `git describe` retorne a versão correta no modo dev:
   ```bash
   git checkout develop && git fetch origin master && git merge origin/master --no-edit && git push origin develop
   ```
   Sem este passo, `git describe` não encontra a tag (que vive no merge commit de master) e retorna a versão anterior.

**Estrutura do arquivo de release:**

```markdown
# Release vX.Y.Z — YYYYMMDD

## Histórias

| Status | Descrição | Branch | PR |
|--------|-----------|--------|----|
| [ ]    | descrição | `branch-name` | — |
| [~]    | descrição | `branch-name` | #123 |
| [x]    | descrição | `branch-name` | #123 |
| [✓]    | descrição | `branch-name` | #123 |
```

**Legenda de status:** `[ ]` planejada · `[~]` aguardando aprovação no GitHub · `[x]` aprovada · `[✓]` mergeada.
