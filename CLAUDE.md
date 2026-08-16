# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este projeto

Sistema de monitoramento residencial via RTSP. Cada câmera configurada tem três processos ffmpeg rodando em paralelo: um grava chunks MP4 em disco, outro gera segmentos HLS para visualização ao vivo e um terceiro detecta movimento por diff de frames. O frontend React é embutido no binário Go via `go:embed`.

## Fluxo de trabalho

O fluxo completo — XP/TDD, análise, story decomposta em tickets, code review automatizado por subagent, testes funcionais, estratégia de branches, CI/branch protection, slash commands, hooks, scripts de workflow e planejamento/corte de release — vive **inteiramente** em **[`docs/workflow.md`](docs/workflow.md)**, única fonte de detalhe procedural do projeto: nada aqui duplica o que está lá, então se este resumo e `docs/workflow.md` alguma vez divergirem, `docs/workflow.md` vale. **Leia esse arquivo por completo antes de qualquer trabalho de fluxo** (o hook `session-start` lembra a cada sessão) — releia se não tiver certeza de já conhecê-lo nesta sessão (sessão nova, contexto resumido, etc.).

O que precisa sobreviver mesmo sem reler o arquivo:
- Só **3 gates humanos** — G1 (Análise aprovada), G2 (História revisada), G3 (release). Entre eles, o ciclo roda sozinho, sem prompts ao navigator (exceções documentadas em `docs/workflow.md`).
- `master` e `develop` são protegidos — nunca commit/push direto; tudo via PR.
- G3 (PR `develop → master`) só com ok explícito do navigator.

## Comandos principais

### Backend (Go)

```bash
go test ./...                                         # todos os testes
go test ./internal/server/... -run TestLogin          # teste específico
make build                                            # binário local com versão git injetada
make run                                              # sobe Docker dev com live reload (dev-camera)
make all                                              # cross-compila para linux-amd64/arm64/arm e windows-amd64
make linux-amd64                                      # binário específico em dist/
make rpi                                              # alias para linux-arm64 (Raspberry Pi 3/4/5 64-bit)
./camera init                                         # wizard interativo → gera camera.yaml no diretório atual
./camera init --output /etc/camera/camera.yaml        # wizard → grava no caminho especificado
./camera version                                      # imprime versão, commit e data do build
```

### Frontend (`frontend/src/`)

SPA React/Vite/Tailwind embutida no binário via `go:embed`. Páginas principais: `LoginPage` → `LiveViewPage` (landing, rota `/`) → `LivePage` / `HistoryPage` / `VideoBrowserPage` / `RecordingsPage` / `ReportsPage`. Seção de configurações em `/settings/*` com sidebar lateral (padrão GitHub Settings). Token JWT em `localStorage` (`auth.ts`). Em desenvolvimento, Vite faz proxy de `/api` e `/stream` para `localhost:8080`.

**Documentação completa por área vive em [`docs/frontend/`](docs/frontend/README.md)** — arquitetura, decisões e invariantes ficam lá, nunca aqui (mesmo padrão de `docs/go-modules/` pro backend, ver "Pacotes internos" abaixo). Mantida automaticamente pelo subagent `docs-writer` ao final de cada história (ver `docs/workflow.md`).

| Área | Doc completa |
|---|---|
| Rotas e edição (padrão edição-via-rota-dedicada, `id` único, rotas de câmera) | [docs/frontend/routing-editing.md](docs/frontend/routing-editing.md) |
| Design system (tokens, tema, modo de cor, accent, exceção MUI) | [docs/frontend/design-system.md](docs/frontend/design-system.md) |
| Shell e navegação (`Sidebar`, `TopBar`, `Layout`, `PageHeader`, `Settings`/`PreferencesLayout`) | [docs/frontend/shell-layout.md](docs/frontend/shell-layout.md) |
| Player e reprodução (`Player`, `VideoPlayer`, `Zoom`, `RecordingPlayerModal`) | [docs/frontend/player.md](docs/frontend/player.md) |
| Páginas principais (`LivePage`/`HistoryPage`/`VideoBrowserPage`/`RecordingsPage`/`ReportsPage`/`LiveViewPage`) | [docs/frontend/pages.md](docs/frontend/pages.md) |
| Configuração de câmera (`CameraForm`, seções sempre-editáveis, `CameraDetailSettingsPage`) | [docs/frontend/camera-settings.md](docs/frontend/camera-settings.md) |
| Extensões (Preferências > Extensões, Telegram, S3) | [docs/frontend/extensions.md](docs/frontend/extensions.md) |
| Usuários e perfil | [docs/frontend/users-profile.md](docs/frontend/users-profile.md) |
| Notificações (sino) | [docs/frontend/notifications.md](docs/frontend/notifications.md) |

```bash
make frontend # builda o frontend via Docker (node:20-alpine) — gera frontend/dist
cd frontend
yarn install  # apenas para desenvolvimento local do frontend
yarn dev      # Vite dev server na porta 5173 (proxy /api e /stream para :8080)
```

**Node/yarn não estão instalados no sistema host** — os testes e builds do frontend rodam via Docker. Para rodar os testes do frontend localmente use:

```bash
# Testes + lint + build do frontend via Docker (equivalente ao CI)
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$(pwd)/frontend":/app \
  -v camera-yarn-cache:/yarn-cache \
  -w /app \
  -e YARN_CACHE_FOLDER=/yarn-cache \
  -e HOME=/tmp \
  node:20-alpine \
  sh -c "yarn install --frozen-lockfile && yarn lint && yarn test --run && yarn build"
```

Nunca afirmar que os testes do frontend passaram sem ter rodado o comando acima (ou visto o CI verde).

### Serviço YOLO (`services/yolo/`)

Microserviço Python/FastAPI opcional para análise de gravações e fine-tuning. Expõe:
- `POST /analyze` — inferência YOLO em arquivo MP4
- `POST /finetune` / `GET /finetune/status/{id}` / `DELETE /finetune/{id}` — treino assíncrono (detecção)
- **State classification** (`yolov8n-cls`): `POST /classify` (imagem/crop → `{predictions:[{label,prob}], top}`), `POST /classify/train` (treina a partir de samples `{image_path,label}`, dataset em **pastas por classe**, assíncrono — status pelo mesmo `GET /finetune/status/{id}`; guard de tamanho barra `l`/`x`; treina com **`fliplr=0.0`** — o flip horizontal corromperia classes direcionais, ex.: pessoa entrando vs saindo), `GET /classify/models`.

**Testes do serviço:** `services/yolo/test_main.py` (pytest). As deps pesadas (torch/ultralytics/cv2) são **stubadas via `sys.modules`** antes de importar `main`, então os testes rodam numa imagem Python slim sem GPU. Rodam via `scripts/yolo-check.sh` (Docker), acionado pelo `scripts/check.sh` quando `services/yolo/` muda, e por um job dedicado no CI (`.github/workflows/ci.yml`).

**Subir o serviço:** totalmente independente do `docker-compose.yml` da câmera — compose file próprio em `services/yolo/`. Só precisa (1) estar acessível pela URL configurada em Settings e (2) montar o **mesmo diretório de storage** da instância de câmera que vai consumi-lo (os paths de arquivo trocados via API são resolvidos dentro do container do YOLO a partir desse volume — divergência aqui é a causa mais comum de `404` no `/classify`/`/analyze`). Copie `services/yolo/.env.example` para `services/yolo/.env` e ajuste `YOLO_STORAGE_PATH`/`YOLO_MODELS_PATH` antes de subir.

```bash
# CPU (qualquer hardware, incluindo Raspberry Pi)
docker compose -f services/yolo/docker-compose.yml up -d

# GPU NVIDIA (requer nvidia-container-toolkit no host)
docker compose -f services/yolo/docker-compose.yml -f services/yolo/docker-compose.nvidia.yml up -d
```

O padrão de **override files** mantém `services/yolo/docker-compose.yml` universal (funciona em RPi, AMD, CPU-only) e `services/yolo/docker-compose.nvidia.yml` adiciona apenas o device reservation NVIDIA. Nunca colocar configuração de GPU no `docker-compose.yml` base.

Modelos pré-baixados na imagem: `yolov8n` e `yolo11n`. Com GPU RTX 3050 (4GB VRAM): fine-tuning viável para variantes `n` e `s`; variantes `l` e `x` causam OOM no treino (inferência funciona). Ver `docs/analysis.md` para documentação completa.

### Testes e2e (`e2e/`)

Suíte Playwright ponta-a-ponta, **independente do resto do projeto**: pacote próprio (`package.json`/`tsconfig.json`/`eslint.config.js`/`.prettierrc`, gerenciado só por **bun** — o `frontend/` continua em yarn, sem relação) e **Docker-only** — tanto o servidor sob teste quanto o Playwright rodam em container, sem exigir Go/Node/bun no host além do Docker.

- `e2e/seed/` — programa Go standalone (`go build ./e2e/seed`) que gera um **fixture determinístico** direto via `internal/db`/`internal/config` (sem RTSP real). O dado (`Fixture`, `e2e/seed/fixture.go`) é separado de como é materializado (`applyFixture`): `Fixture{Users []FixtureUser; Cameras []FixtureCamera}` — `FixtureCamera` **embute** `config.CameraConfig` (`yaml:",inline"`, reaproveita as tags yaml que esse struct já tinha) + `Recordings int` (nº de gravações contíguas, `recordingSlots`/`schedule_test.go`) + `Events []FixtureMotionEvent` (referencia uma gravação da própria câmera por índice cronológico — `RecordingIndex`/`OffsetSeconds` — nunca um instante solto; `Score`/`Label`/`BboxX/Y/W/H` viram um `db.MotionEvent`). `defaultFixture(...)` é o fixture usado por `scripts/e2e.sh` (sem `-fixture`): 1 admin, 1 **viewer com acesso concedido só à 1ª câmera** (`db.SetUserCameras` — cobre o cenário de acesso restrito) e uma **2ª câmera nunca concedida** (cenário negativo — viewer tenta acessá-la e recebe "câmera não encontrada", já que `GET /api/cameras` filtra a lista por usuário). `-fixture <arquivo.yaml>` (opcional) troca o default por um arquivo no mesmo formato — útil pra câmeras com configs diversas ou eventos de movimento com label/bbox, que não escalariam como flag por dimensão (ver exemplo em `e2e/seed/fixtures/motion-example.yaml`). Cada gravação é uma cópia de um MP4 de amostra embutido (`sample.mp4`, via `go:embed`). Escreve o `camera.yaml` de bootstrap com caminhos **absolutos** (`cmd/camera` resolve `DBPath`/`Storage.Path` relativos ao CWD do processo, não ao diretório do yaml) e imprime os ids gerados em JSON (1º admin/viewer/câmeras do Fixture, mesma convenção de sempre). Ids/credenciais do fixture default (`-admin-user`, `-admin-pass`, `-camera-id`, `-admin-only-camera-id`, `-viewer-user`, `-viewer-pass`) são **flags**, não constantes — os defaults só valem quando a flag é omitida; quem efetivamente os define é o `docker-compose.yml` (ver abaixo), pra não duplicar os mesmos literais no código Go.
- Novo stage `e2e` no `Dockerfile` raiz (+`e2e-builder`, build nativo sem cross-compile) builda `camera`+`seed` numa imagem mínima com `ffmpeg`+`curl`; `e2e/docker-entrypoint.sh` repassa `E2E_ADMIN_USER`/`E2E_ADMIN_PASS`/`E2E_CAMERA_ID`/`E2E_ADMIN_ONLY_CAMERA_ID`/`E2E_VIEWER_USER`/`E2E_VIEWER_PASS` do ambiente como flags do seed (sem fallback aqui de propósito — ver `e2e/.env.example`), semeia o fixture num dir efêmero e sobe o servidor já apontado pra ele.
- `e2e/docker-compose.yml` — dois serviços numa rede só do compose (sem porta publicada no host): `e2e-camera` (build do stage `e2e`, healthcheck via `curl` em `/api/config`) e `e2e-playwright` (imagem `oven/bun:1`, instala os browsers na hora — `bunx playwright install --with-deps chromium` —, roda `bunx playwright test` contra `http://e2e-camera:8099`). Nomes com prefixo `e2e-` (convenção do projeto pra serviços não-produção — agrupa por contexto, evita colisão com o `camera` de produção do `docker-compose.yml` raiz quando este arquivo é incluído nele, ver abaixo). Ids/credenciais do fixture (câmera com UUID fixo, `recording_id=1`) chegam aos dois serviços via um anchor YAML único (`x-fixture-env`, mesclado com `<<:` no `environment:` de cada serviço) — **única declaração** desses valores no repo, com sintaxe `${VAR:-default}` pra permitir override via `e2e/.env` (ver `e2e/.env.example`) sem editar o compose. As opções do Playwright (`reporter`/`screenshot`/`video`, `e2e/playwright.config.ts`) são configuráveis do mesmo jeito, só no serviço `e2e-playwright`.
- **Iterar num spec e2e sem pagar o custo de build+seed+install do zero a cada vez:** o `docker-compose.yml` raiz inclui `e2e/docker-compose.yml` via `include:` e sobrescreve `e2e-camera`/`e2e-playwright` com `profiles: [development]` (opt-in, mesmo profile de `dev-camera` — nenhum `docker compose up`/`config` sem `--profile development` enxerga esses dois serviços). O override de `e2e-playwright` troca o `command:` one-shot original (usado só por `scripts/e2e.sh`/CI) por um keep-alive: instala deps do bun + Chromium uma vez e fica idle (`tail -f /dev/null`); daí um teste roda repetidamente via `docker compose --profile development exec e2e-playwright bunx playwright test <arquivo>`, sem reinstalar nada. Volume nomeado próprio (`e2e-playwright-browsers`) persiste o cache do Chromium (`~/.cache/ms-playwright`) entre subidas — sem ele, cada `docker compose up` reinstalaria o browser do zero. `scripts/compose-check.sh` valida essa topologia via `docker compose config` de verdade (não leitura de texto): `e2e-camera`/`e2e-playwright` só aparecem com `--profile development`, nunca sem. **Suba com `--profile development up -d --wait` antes do 1º `exec`** (ou espere `docker compose ps` mostrar `(healthy)`) — o `command:` do `e2e-playwright` só cria o marcador `/tmp/e2e-playwright-ready` (o que o `healthcheck:` observa) depois que `bun install`+`playwright install` terminam; um `exec` disparado antes disso falha ("Executable doesn't exist").
- `scripts/e2e.sh` — orquestrador estático (`docker compose up --build --abort-on-container-exit --exit-code-from e2e-playwright`, teardown via `trap`), mesmo padrão de `scripts/frontend-check.sh`/`scripts/yolo-check.sh`. Rodado por um job dedicado no CI (`.github/workflows/ci.yml`, job `e2e`), **bloqueante em todo PR** (sem filtro de path) — deliberadamente enxuto (specs de smoke pro papel admin e um cenário de acesso restrito pro papel viewer, não escala/performance), já que `scripts/merge-when-green.sh` espera todos os check-runs antes de mergear.
- `scripts/e2e.sh` gera `e2e/playwright-report/` (HTML, gitignored). `scripts/e2e-report.sh [porta]` sobe um container `oven/bun:1` (mesma imagem do serviço `e2e-playwright`) rodando `bunx playwright show-report --host 0.0.0.0`, com a porta publicada no host (default `9323`, diferente do compose principal que não publica porta nenhuma) — só pra essa visualização pontual, sem exigir bun no host.
- **Relatório em PDF (opcional):** `E2E_PDF_REPORT=on` (default `off`, ver `e2e/.env.example`) acrescenta o reporter customizado `e2e/reporters/pdf-reporter.ts` ao array de `reporter` em `e2e/playwright.config.ts` — aditivo ao `E2E_REPORTER` (HTML/list/etc.), não o substitui. Existe porque o relatório HTML oficial do Playwright é uma SPA com testes colapsados e screenshots atrás de lazy-load — um print direto da página captura só a lista resumida, sem detalhes nem imagens. O reporter monta um HTML "plano" (já expandido, título/status/duração/erros por teste) com cada screenshot embutido inline via `data:image/png;base64,...` (lido do path do attachment) e imprime esse HTML com `chromium.launch()` + `page.pdf()` — os bytes da imagem ficam nos próprios objetos `/Image` do PDF, nunca uma referência externa a `playwright-report/data/`. Gera `e2e/playwright-report/report.pdf` (mesmo diretório do HTML, gitignored, sobrescrito a cada run).

## Arquitetura

### Binários

| Binário | Responsabilidade |
|---|---|
| `cmd/camera` | Servidor principal: grava, faz streaming HLS, detecta movimento e serve a SPA. Suporta o subcomando `camera init` — wizard interativo que gera o arquivo de bootstrap (`camera.yaml`) com porta, `db_path`, storage e credenciais do admin inicial. |
| `cmd/mcp-ffprobe` | Servidor MCP (stdio) que expõe `probe_stream` — executa ffprobe em uma URL RTSP e retorna os metadados JSON do stream. Útil para inspeção de câmeras via ferramentas MCP. |

### Fluxo de inicialização (`cmd/camera/main.go`)

1. Lê o arquivo de bootstrap (`camera.yaml`) com porta, `db_path`, storage e credenciais do admin.
2. Abre o banco SQLite e executa as migrations pendentes.
3. Na primeira execução, cria o usuário admin com `must_change_password = true`.
4. Lê câmeras do banco e para cada câmera habilitada inicia:
   - Um `recorder.Recorder` — grava RTSP/HLS → MP4 chunk (somente se `recording_enabled=true`)
   - Um `hls.HLSStreamer` — grava RTSP/HLS → segmentos HLS para live (gateado por `webrtc.ShouldRunHLS`)
   - Um `webrtc.Publisher` — entrega o ao-vivo de baixa latência (só câmeras H.264, gateado por `webrtc.ShouldPublish`)
   - Um `motion.Monitor` — detecta movimento via ffmpeg pipe raw (se motion habilitado)
5. O `server.Server` é levantado em goroutine separada e serve a SPA + API REST; um `notifications.Dispatcher` é construído e injetado nele e no `storage.Cleaner`.
6. Um `stateengine.Runner` por classificador de estado habilitado sobe quando o serviço YOLO está configurado.
7. Câmeras adicionadas/removidas via API ativam callbacks `onCameraStart` / `onCameraStop` (em goroutine, para não bloquear o handler HTTP).

### Pacotes internos

| Pacote | Responsabilidade |
|---|---|
| `internal/core` | Utilitários de captura genéricos compartilhados por mais de um protocolo. Doc completa: [docs/go-modules/internal/core/README.md](docs/go-modules/internal/core/README.md). |
| `internal/capturer` | Builders de argumentos ffmpeg por protocolo de captura (rtsp/hls). Doc completa: [docs/go-modules/internal/capturer/README.md](docs/go-modules/internal/capturer/README.md). |
| `internal/capturer/rtsp` | Args de conexão/snapshot RTSP. Doc completa: [docs/go-modules/internal/capturer/rtsp/README.md](docs/go-modules/internal/capturer/rtsp/README.md). |
| `internal/capturer/hls` | Args de conexão pra câmeras cuja fonte já é HLS. Doc completa: [docs/go-modules/internal/capturer/hls/README.md](docs/go-modules/internal/capturer/hls/README.md). |
| `internal/exec` | Interfaces `Commander`/`Process` (processo ffmpeg de longa duração) sobre `os/exec`, injetadas nos pacotes de captura pra permitir testes sem ffmpeg. Doc completa: [docs/go-modules/internal/exec/README.md](docs/go-modules/internal/exec/README.md). |
| `internal/recorder` | Grava RTSP/HLS em chunks MP4 não fragmentados. Doc completa: [docs/go-modules/internal/recorder/README.md](docs/go-modules/internal/recorder/README.md). |
| `internal/transmission/hls` | Gera playlist HLS ao vivo (modo padrão ou DVR). Doc completa: [docs/go-modules/internal/transmission/hls/README.md](docs/go-modules/internal/transmission/hls/README.md). |
| `internal/transmission/webrtc` | Entrega o ao-vivo de baixa latência via WebRTC (sub-segundo, só H.264), par simétrico do HLS. Doc completa: [docs/go-modules/internal/transmission/webrtc/README.md](docs/go-modules/internal/transmission/webrtc/README.md). |
| `internal/motion` | Detecta movimento via ffmpeg pipe raw; persiste eventos e snapshot anotado. Doc completa: [docs/go-modules/internal/motion/README.md](docs/go-modules/internal/motion/README.md). |
| `internal/zones` | Tipo `Zone` (zonas de exclusão/detecção), sem lógica de detecção. Doc completa: [docs/go-modules/internal/zones/README.md](docs/go-modules/internal/zones/README.md). |
| `internal/discovery` | Descoberta de câmeras na rede (ONVIF WS-Discovery + varredura de porta 554). Doc completa: [docs/go-modules/internal/discovery/README.md](docs/go-modules/internal/discovery/README.md). |
| `internal/storage` | `Cleaner`: retenção diferenciada por categoria, sincronização filesystem↔banco, S3, aviso de disco cheio. Doc completa: [docs/go-modules/internal/storage/README.md](docs/go-modules/internal/storage/README.md). |
| `internal/db` | Acesso ao SQLite (`modernc.org/sqlite`); migrations em `internal/db/migrations/` (doc: [docs/go-modules/internal/db/migrations/README.md](docs/go-modules/internal/db/migrations/README.md)); tabelas de câmeras/usuários/gravações/eventos/state classification; `user_settings` (KV genérico por usuário). Doc completa: [docs/go-modules/internal/db/README.md](docs/go-modules/internal/db/README.md). |
| `internal/dbbackup` | Snapshot/restore do banco SQLite (rede de segurança do updater). Doc completa: [docs/go-modules/internal/dbbackup/README.md](docs/go-modules/internal/dbbackup/README.md). |
| `internal/email` | Envio de e-mail (recuperação de senha; genérico o bastante pra outros usos, ex. sender `email` de notificações). Doc completa: [docs/go-modules/internal/email/README.md](docs/go-modules/internal/email/README.md). |
| `internal/notifications` | Único ponto da aplicação que sabe como entregar uma notificação (application/email hoje); quem sabe pra quem continua sendo o chamador. Doc completa: [docs/go-modules/internal/notifications/README.md](docs/go-modules/internal/notifications/README.md). |
| `internal/notifications/application` | Sender "dentro da aplicação" (persistência + push ao vivo). Doc completa: [docs/go-modules/internal/notifications/application/README.md](docs/go-modules/internal/notifications/application/README.md). |
| `internal/notifications/email` | Sender por e-mail, opt-in por usuário. Doc completa: [docs/go-modules/internal/notifications/email/README.md](docs/go-modules/internal/notifications/email/README.md). |
| `internal/ffprobe` | Executa e parseia saída JSON do ffprobe para detectar codec, áudio e dimensões do stream. Doc completa: [docs/go-modules/internal/ffprobe/README.md](docs/go-modules/internal/ffprobe/README.md). |
| `internal/deviceinfo` | Captura metadados de hardware/manutenção da câmera (EAV, extensível por `Collector` — hoje só Dahua/Intelbras). Doc completa: [docs/go-modules/internal/deviceinfo/README.md](docs/go-modules/internal/deviceinfo/README.md). |
| `internal/server` | HTTP server: JWT + API REST + arquivos de gravação/HLS + a SPA React embutida. Doc completa: [docs/go-modules/internal/server/README.md](docs/go-modules/internal/server/README.md). |
| `internal/release` | Checagem de atualização disponível e busca de changelog (GitHub Releases). Doc completa: [docs/go-modules/internal/release/README.md](docs/go-modules/internal/release/README.md). |
| `internal/updater` | Detecta o modo de auto-atualização do ambiente e aplica (self-replace/docker/notify). Doc completa: [docs/go-modules/internal/updater/README.md](docs/go-modules/internal/updater/README.md). |
| `internal/extensions` | Domínio de integrações opcionais ("extensões"), configuráveis em Preferências > Extensões; agrupa um subpacote por extensão. Doc completa: [docs/go-modules/internal/extensions/README.md](docs/go-modules/internal/extensions/README.md). |
| `internal/extensions/telegram` | Cliente mínimo da Bot API do Telegram — pacote autocontido, não invocado por `main.go` ainda (ativação em Preferências > Extensões não dispara nada nesta história). Doc completa: [docs/go-modules/internal/extensions/telegram/README.md](docs/go-modules/internal/extensions/telegram/README.md). |
| `internal/trainer` | Despacha jobs de fine-tuning de object detection pra um adapter de backend plugável (`trainers.type`). Doc completa: [docs/go-modules/internal/trainer/README.md](docs/go-modules/internal/trainer/README.md). |
| `internal/trainer/adapters` | O adapter `Yolo`, único backend de treino hoje. Doc completa: [docs/go-modules/internal/trainer/adapters/README.md](docs/go-modules/internal/trainer/adapters/README.md). |
| `internal/analysis` | Cliente HTTP do serviço YOLO — tipos/Client compartilhados por detecção, state classification e fine-tuning. Doc completa: [docs/go-modules/internal/analysis/README.md](docs/go-modules/internal/analysis/README.md). |
| `internal/detector` | Despacha inferência de detecção de objetos pra um adapter plugável (yolo/huggingface). Doc completa: [docs/go-modules/internal/detector/README.md](docs/go-modules/internal/detector/README.md). |
| `internal/detector/adapters` | Os adapters `Yolo` e `HuggingFace`. Doc completa: [docs/go-modules/internal/detector/adapters/README.md](docs/go-modules/internal/detector/adapters/README.md). |
| `internal/stateclass` | Tipos de domínio da classificação de estado (`Classifier`, `Tracker`). Doc completa: [docs/go-modules/internal/stateclass/README.md](docs/go-modules/internal/stateclass/README.md). |
| `internal/stateengine` | Roda a inferência de estado: grab → classify → tracker → persist/emit. Doc completa: [docs/go-modules/internal/stateengine/README.md](docs/go-modules/internal/stateengine/README.md). |
| `internal/config` | Lê o arquivo de bootstrap (`camera.yaml`) com porta, `db_path`, storage e credenciais do admin. Variáveis de ambiente sobrescrevem campos específicos (ver abaixo). Doc completa: [docs/go-modules/internal/config/README.md](docs/go-modules/internal/config/README.md). |
| `internal/logger` | Constrói o `*slog.Logger` a partir de `config.LogConfig` — `stdout` (JSON) ou `file` (um arquivo por nível, com rotação via lumberjack). Knobs em `camera.yaml`, seção `log:`. Doc completa: [docs/go-modules/internal/logger/README.md](docs/go-modules/internal/logger/README.md). |
| `frontend/` | SPA React/Vite/Tailwind embutida via `go:embed all:dist`. `ChangePasswordPage` — tela obrigatória no primeiro login; bloqueia acesso ao restante da UI enquanto `must_change_password=true` no JWT. |

### Superfície da API

A **fonte de verdade das rotas** é `internal/server/routes.go` → `routeTable()`: uma tabela declarativa de `route{method, path, auth, handler}`. O `routes()` itera essa tabela e aplica o middleware **derivado do `authLevel`** (`authPublic`/`authChangePassword`/`authFull`/`authAdmin`/`authCamera` → `guard()`), em vez de embrulhar cada rota à mão. Só os mounts por prefixo (`/stream/`, `/recordings/`) e o `spaHandler` ficam fora da tabela (são `http.Handler`, não `http.HandlerFunc`).

Erros da API são `text/plain` (via `http.Error`), não um envelope JSON — clientes devem programar contra o status, não contra o texto do erro.

### Autenticação

O JWT é assinado com um segredo aleatório gerado no boot — tokens não sobrevivem a reinicializações do servidor. O token é aceito via header `Authorization: Bearer <token>` ou query param `?token=<token>` (necessário para `<video src>` e `<Player>`).

Fluxo de primeiro acesso: o admin inicial é criado com `must_change_password = true`. No primeiro login o servidor emite um token com esse claim; o frontend redireciona obrigatoriamente para `ChangePasswordPage`. Após a troca a flag é zerada no banco e o acesso normal é liberado. A senha do bootstrap não precisa ser atualizada — serve apenas na criação inicial.

### Build info

`version`, `commit` e `builtAt` são injetados via `-ldflags` no `Makefile`. Em `main.go` são passados ao servidor via `WithVersion(version)` e `WithBuildInfo(commit, builtAt)`. O endpoint `GET /api/about` expõe esses valores junto com `uptime_seconds` e `go_version`.

## Variáveis de ambiente

Todas seguem o prefixo `OS_CAMERA_`.

| Variável | Campo sobrescrito |
|---|---|
| `OS_CAMERA_TIMEZONE` | `timezone` (fuso da instalação; usado pelo servidor para interpretar datas locais) |
| `OS_CAMERA_JWT_SECRET` | `server.jwt_secret` (segredo JWT fixo; vazio = gerado aleatoriamente a cada boot) |
| `OS_CAMERA_DEBUG` | `debug` (ativa logs de nível debug) |
| `OS_CAMERA_SMTP_HOST` | `smtp.host` |
| `OS_CAMERA_SMTP_PORT` | `smtp.port` |
| `OS_CAMERA_SMTP_USERNAME` | `smtp.username` |
| `OS_CAMERA_SMTP_PASSWORD` | `smtp.password` |
| `OS_CAMERA_SMTP_FROM_NAME` | `smtp.from_name` (nome de exibição do remetente; default `"os-camera"`) |
| `OS_CAMERA_SMTP_FROM_EMAIL` | `smtp.from_email` (e-mail do remetente/envelope `MAIL FROM`; default = `smtp.username`) |
| `OS_CAMERA_STORAGE_PATH` | `storage.path` (diretório raiz das gravações) |

`smtp.*` é configuração de conexão (`internal/config.SMTPConfig`); o envio em si é feito por `internal/email` (ver tabela de pacotes internos acima). `FromName`/`FromEmail` resolvem seus defaults (`"os-camera"`/`Username`) em `internal/email.SMTPSender.Send`, não em `Load()` — os campos ficam vazios em `SMTPConfig` quando não configurados.

## Diretório `work_progress/`

Diretório único (gitignored: `work_progress/`) que agrupa todo o estado de trabalho não versionado do fluxo — cada um dos quatro subdiretórios abaixo mantém seu próprio propósito e convenções, só a raiz mudou:

- `work_progress/analysis/` — análises da fase G1 (`/analyze`), ver "Fluxo de trabalho" acima e `docs/workflow.md`.
- `work_progress/stories/` — a história atual decomposta em tickets (fase G2, `/story`), idem.
- `work_progress/releases/` — planejamento/corte de release (`_next.md` e releases publicadas), idem.
- `work_progress/amostras/` — reservado para arquivos que o navigator coloca para análise contextual — screenshots, logs, dumps de banco, exemplos de vídeo ou qualquer artefato que ajude a diagnosticar um problema. Claude deve inspecionar o conteúdo desse diretório quando o navigator mencionar que colocou algo lá, ou quando precisar de evidência concreta para uma investigação.

## Manutenção contínua

- **Decisões de fluxo se registram em `docs/workflow.md`** — única fonte canônica do processo (ver "Fluxo de trabalho" acima). A memória do Claude é só atalho/ponteiro: nunca deixe uma regra de workflow apenas na memória.
- **`CLAUDE.md` nunca documenta funcionalidade inline — só referencia.** Comportamento, decisão de design e histórico relevante vivem em `docs/go-modules/<pacote>/README.md` (backend) ou `docs/frontend/<área>.md` (frontend), seguindo o modelo em [`docs/frontend/README.md`](docs/frontend/README.md). Ao final de cada história, o subagent `docs-writer` (`.claude/agents/docs-writer.md`) atualiza os docs afetados automaticamente (ver `docs/workflow.md`) — o driver só edita `CLAUDE.md` à mão quando uma área inteiramente nova precisa de uma linha de pointer nova na tabela correspondente.
- **Ao adicionar, remover ou mudar o acesso de uma rota**, atualize `internal/server/routes.go` (a tabela).
- **Ao adicionar ou alterar qualquer campo de configuração**, atualize `camera.yaml.example` com o novo campo, valor de exemplo e comentário com a variável de ambiente correspondente (se houver).

## Convenções de teste

Testes usam `httptest.NewRecorder` (server), `fakeCommander` com `trackingProcess` (recorder/streamer) e implementações fake das interfaces de `internal/exec`. O banco SQLite é criado em memória (`:memory:`) nos testes de server e db — nenhum mock externo. Cada pacote é testado em isolamento via injeção de dependência.

## Diretrizes de Desenvolvimento Go

Sempre priorize a simplicidade e a legibilidade conforme os provérbios do Go ("Effective Go").

### 1. Princípio DRY e Abstração
- **Evite Abstração Precoce:** Siga a "Regra de Três". Não crie abstrações ou interfaces até que haja pelo menos três casos de uso concretos.
- **Cópia vs. Dependência:** Prefira duplicar uma pequena função utilitária do que introduzir uma dependência externa desnecessária.
- **Interfaces:** Defina interfaces no lado do consumidor (onde são usadas) e não no lado do produtor. Mantenha as interfaces pequenas (1 ou 2 métodos).

### 2. Estilo e Convenções de Código
- **Alinhamento do "Happy Path":** Mantenha o fluxo principal de sucesso alinhado à esquerda. Use *guard clauses* para tratar erros e retorne o mais cedo possível.
- **Nomenclatura:**
    - Variáveis de escopo curto: Curtas (ex: `ctx`, `w`, `r`, `i`).
    - Variáveis globais/longas: Descritivas.
    - Interfaces: Sufixo "-er" para interfaces de um único método (ex: `Formatter`, `Storer`).
- **Zero Value:** Projete structs para que o valor zero (`var s MyStruct`) seja útil e seguro para uso imediato.

### 3. Tratamento de Erros
- **Erros são Valores:** Sempre verifique erros explicitamente logo após a chamada: `if err != nil { return err }`.
- **Contexto de Erro:** Utilize `fmt.Errorf("contexto do erro: %w", err)` para adicionar contexto sem perder o erro original (wrapping).
- **Sem Panics:** Nunca use `panic` para controle de fluxo. Reserve-o apenas para erros catastróficos de inicialização ou bugs lógicos irrecuperáveis.

### 4. Concorrência e Performance
- **Canais vs. Mutex:** "Não comunique compartilhando memória; compartilhe memória comunicando". Use canais para orquestração e `sync.Mutex` para proteção de estado simples.
- **Goroutines:** Sempre saiba como uma goroutine vai terminar antes de iniciá-la para evitar vazamentos de memória.
- **Ponteiros:** Use ponteiros apenas quando precisar mutar o estado ou para evitar cópias de structs muito grandes (> 64-128 bytes).

### 5. Tooling Obrigatório
- Todo código gerado deve ser compatível com o `gofmt`.
