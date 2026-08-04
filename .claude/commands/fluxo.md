---
description: Lê docs/workflow.md por completo (única fonte do fluxo) e confirma o entendimento
---

Carregue e internalize **todo o fluxo de trabalho** deste projeto antes de agir. Este comando não inicia nenhuma história nem executa nenhuma ação — só lê e confirma.

## Passos

1. **Leia integralmente `docs/workflow.md`** com a ferramenta Read (é a **única** fonte de detalhe procedural: XP/TDD, estratégia de branches, CI/branch protection, ciclo por história com os gates, slash commands, hooks, scripts de workflow e planejamento/corte de release). Leia o arquivo inteiro, não só um trecho. **Não restate as regras com suas próprias palavras** em nenhum arquivo deste repo (`CLAUDE.md` incluído) — isso já causou pelo menos uma divergência real entre cópias; `docs/workflow.md` é a única fonte, tudo mais só aponta pra lá.

2. **Confirme o entendimento** citando de cabeça, sem reabrir discussão e sem começar tarefa nenhuma: os 3 gates humanos (G1/G2/G3, o arquivo/checkbox de cada um) e o nome do script que fecha cada transição entre eles. Se algum desses detalhes não vier com segurança, releia `docs/workflow.md` antes de confirmar.

## Restrição

- **Não** crie story, branch, nem rode scripts de workflow ao executar este comando. O objetivo é só carregar o fluxo no contexto e confirmar que está alinhado.
