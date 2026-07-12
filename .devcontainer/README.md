# Dev container isolado do host

Ambiente de desenvolvimento com dockerd, Go, Node e credenciais **próprios do
container** — nada de socket Docker, chave SSH ou token `gh` do host montado
para dentro.

## Uso

1. VS Code: "Dev Containers: Reopen in Container" (com a extensão Dev
   Containers instalada). A partir daí, o Claude Code (extensão) roda dentro
   do container — todo `Bash`/`Read`/`Edit` fica confinado a ele.
2. No terminal do container, uma vez:
   ```bash
   gh auth login          # conta/token dedicado a este container
   gh auth setup-git      # git usa o gh como credential helper (HTTPS)
   git remote set-url origin https://github.com/jacksonbicalho/os-camera.git
   ```
3. Fluxo normal (`scripts/story.sh`, `scripts/check.sh`, `scripts/commit.sh`,
   `scripts/push-pr.sh`, ...) funciona igual — `scripts/check.sh` fala com o
   dockerd **interno** do container (feature `docker-in-docker`), não com o
   do host.

## O que é isolado, o que não é

- **Isolado**: dockerd (daemon próprio via `docker-in-docker`, não
  `/var/run/docker.sock` do host), credenciais git/gh (volume Docker próprio,
  `gh auth login` precisa ser refeito por container), toolchain (Go/Node/yarn
  instalados na imagem, não no host).
- **Não isolado, de propósito**: o código-fonte (`workspaceMount` é um bind
  mount do repo local — é o próprio objetivo do dev container).

## Trade-offs

- Primeira `docker run` de `scripts/frontend-check.sh`/`yolo-check.sh` baixa
  as imagens de novo (dockerd interno não compartilha cache de layers com o
  do host) — mais lento na primeira vez, depois fica em cache no volume
  `os-camera-go-cache`/no próprio dockerd interno.
- `docker-in-docker` exige `"privileged": true` no container — é isolamento
  de *credenciais e daemon*, não um sandbox de kernel.
