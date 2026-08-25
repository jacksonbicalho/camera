# Atualizações

O servidor verifica periodicamente se há uma versão mais nova publicada e mostra o resultado em **Configurações → Sobre**.

## Como a checagem funciona

- Roda **uma vez ao subir** o processo e depois **a cada 6 horas** — não existe botão de "checar agora": pra forçar uma checagem imediata, reinicie o processo/container.
- `GET /api/updates` (admin) devolve o resultado **em cache** da última checagem, sem disparar uma nova.
- A checagem lista **todas** as releases publicadas do repositório (estáveis e release candidates), não só a "latest" oficial do GitHub — que nunca aponta pra uma pré-release. Entre elas, escolhe a mais recente por `created_at`, ignorando rascunhos.
- Há atualização disponível quando a versão encontrada é semver maior que a instalada, **ou** quando é a mesma versão mas foi publicada de novo depois do build atual (ver "Release candidates" abaixo).

## Estável vs. release candidate (RC)

Esta instalação pode estar rodando uma versão estável (`vX.Y.Z`) ou uma release candidate (`vX.Y.Z-rc`), publicada a partir de `develop` para testar antes do corte oficial (ver `docs/workflow.md`).

A tag de RC é **flutuante**: cada nova mudança em `develop` recorta a mesma tag (`git push --force`) e a release existente no GitHub é atualizada no lugar — a string de versão não muda. Por isso, quando a instalada já é a RC mais recente por nome, o checker ainda compara a **data de publicação** da release contra a data de build do binário instalado: se a release foi republicada depois desse build, conta como atualização disponível mesmo com a mesma versão.

> Como a checagem só roda a cada 6h (ou no boot), pode levar até esse tempo pra uma RC recém-recortada aparecer como disponível.

## Notificação por sino

Quando uma atualização é detectada, todos os usuários **admin** recebem uma notificação in-app (sino) com link direto pra **Sobre**.

> **Limitação conhecida:** a notificação é deduplicada em memória por versão — dispara só na primeira vez que aquela string de versão aparece como disponível, e é resetada a cada reinício do processo. Numa RC flutuante (mesma versão, republicada várias vezes), rebuilds seguintes da mesma tag não geram uma nova notificação; a página **Sobre** continua sendo a fonte confiável do estado atual.

## Aplicar a atualização

O que aparece em **Sobre** depende de como esta instalação pode se atualizar sozinha — detectado por capacidade, não por adivinhar o ambiente:

| Modo | Quando | O que aparece |
|---|---|---|
| **self-replace** | Binário fora de Docker com permissão de escrita no próprio diretório | Botão **Atualizar agora** — baixa o binário, troca e reinicia sozinho |
| **docker** | Rodando em container (`/.dockerenv` ou cgroup de container) | Instruções: `docker compose pull && docker compose up -d` (ou Watchtower, se configurado) |
| **notify** | Sem permissão de escrita e fora de Docker | Só avisa; é preciso baixar e trocar o binário manualmente |

Docker tem precedência sobre escrita: mesmo com o binário gravável, trocar o arquivo dentro do container seria efêmero (perdido no próximo restart/deploy), então o caminho certo ali é sempre pull+recreate da imagem.

### O que acontece no self-replace

1. Baixa o binário da arquitetura atual e confere o checksum (SHA-256).
2. Faz um snapshot do banco SQLite antes de trocar qualquer coisa.
3. Substitui o binário e grava um marcador de "atualização em trial".
4. Reinicia o processo sozinho.
5. Se o próximo boot também falhar em confirmar o trial (ex.: crash logo na subida), o processo seguinte faz **rollback automático** — binário anterior e snapshot do banco voltam juntos, antes de qualquer outra coisa tocar no banco.

## Ver também

- [Instalação](installation.md)
- `docs/go-modules/internal/release/README.md` e `docs/go-modules/internal/updater/README.md` — detalhe técnico dos pacotes por trás desta página.
