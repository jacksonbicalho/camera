---
description: Fase de Análise — investiga a demanda e produz work_progress/analysis/*.md; aguarda o gate G1 (Análise aprovada)
argument-hint: <descrição livre da demanda>
---

Demanda do navigator: $ARGUMENTS

Execute a **fase de Análise** (passo 1 do fluxo, `docs/workflow.md`):

0. **Leia `docs/workflow.md` por completo com a ferramenta Read, agora, antes de qualquer outra ação** — mesmo que já tenha lido em sessão anterior ou ache que lembra o conteúdo. Não pule este passo silenciosamente: só depois de ler é que a fase de Análise começa.
1. **Investigue antes de escrever.** Explore o código (Grep/Glob/Read) para
   entender o comportamento atual, os módulos envolvidos e a causa raiz (se for
   bug). Não faça perguntas que o código responde.
2. **Liste `.claude/skills/` e invoque via `Skill` tool qualquer skill cujo
   domínio bata com a demanda** (ex.: mudanças de frontend →
   `composition-patterns`/`react-best-practices`/`web-design-guidelines`)
   — incorpore o resultado na Investigação/Opções/Decisão recomendada
   abaixo, antes de aprofundar mais a investigação. Nenhuma skill aplicável
   → siga sem invocar nada.
3. Se a demanda for genuinamente ambígua (duas interpretações levariam a
   soluções diferentes), use AskUserQuestion AGORA — ambiguidade se resolve na
   análise, nunca depois do G1.
4. Crie `work_progress/analysis/YYYYMMDDHHmm_<slug>.md` (timestamp atual, slug curto em
   kebab-case) com exatamente esta estrutura:

   ```markdown
   # Análise — <título curto>

   ## Problema
   ## Investigação
   ## Opções
   ## Decisão recomendada
   ## Impacto

   ## Gate
   - [] Análise aprovada
   ```

   - **Opções**: no mínimo 2 quando houver trade-off real; prós/contras curtos.
   - **Decisão recomendada**: uma opção, com justificativa de 2-3 linhas.
   - **Impacto**: módulos afetados, riscos, necessidade de migração, e uma
     estimativa de decomposição (quantos tickets, grandes temas).
5. Apresente um resumo de ~5 linhas ao navigator e rode em background:
   `bash scripts/await-gate.sh analise <arquivo-da-análise>`
6. **NÃO crie story, branch, código ou teste antes de `[x] Análise aprovada`.**
   Quando o gate abrir, pergunte nada: siga direto para `/story` usando esta
   análise como entrada.

Restrições:
- Não commite nada nesta fase (work_progress/analysis/ é gitignored).
- Trabalhe a partir de `develop` atualizado; se a working tree estiver suja,
  avise e pare.
