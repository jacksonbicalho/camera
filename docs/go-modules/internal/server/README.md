# internal/server

HTTP server: JWT + API REST + arquivos de gravação/HLS + a SPA React
embutida. O maior pacote do projeto (~30 arquivos) — este README agrupa por
subsistema, não arquivo por arquivo.

## Rotas
A **fonte de verdade das rotas** é `routes.go` → `routeTable()`: uma tabela
declarativa de `route{method, path, auth, handler}`. `routes()` itera essa
tabela e aplica o middleware **derivado do `authLevel`**
(`authPublic`/`authChangePassword`/`authFull`/`authAdmin`/`authCamera` →
`guard()`), em vez de embrulhar cada rota à mão. Só os mounts por prefixo
(`/stream/`, `/recordings/`) e o `spaHandler` ficam fora da tabela (são
`http.Handler`, não `http.HandlerFunc`). Erros são `text/plain` (via
`http.Error`), não um envelope JSON — clientes programam contra o status,
não o texto.

## Autenticação
JWT HS256, segredo aleatório gerado a cada boot (tokens não sobrevivem a
restart), aceito via header `Authorization: Bearer` ou `?token=` (necessário
pra `<video src>`/`<Player>`). `must_change_password=true` bloqueia tudo
exceto `POST /api/auth/change-password`. `POST /api/auth/login` aceita
username OU e-mail no campo `username` (`db.GetUserByLogin`) — o sub do JWT
continua sendo o username. Recuperação de senha:
`POST /api/auth/forgot-password` sempre responde `200` (nunca vaza se o
e-mail existe); com `emailSender` configurado
(`WithEmailSender`, ver [internal/email](../email/README.md)), gera um
token (`crypto/rand`) com expiry de 30 min e envia o link de reset.

## Notificações ([internal/notifications](../notifications/README.md))
`Server` guarda um `*notifications.Dispatcher` (`WithNotifications`) e
implementa `notifications/application.LivePush` via `Push(userID int64)`,
delegando ao `notifHub` privado (`notif_hub.go` — fan-out de SSE por
usuário, `GET /api/notifications/live`). `NotifyUpdateAvailable`
(`update_notify.go`) resolve os admins e despacha via `Dispatcher` — no
máximo uma vez por versão `latest` (dedup em memória). Endpoints de leitura:
`GET /api/notifications` (lista + `unread_count`),
`POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`,
`DELETE /api/notifications/{id}`, `DELETE /api/notifications`.

## Preferências do usuário (`theme.go`)
`GET/PUT /api/me/preferences` (`{theme, accent, notify_email}`) — cada campo
é opcional (o de `notify_email` via ponteiro, pra distinguir ausente de
`false`) e só é validado/persistido quando presente, permitindo setar os 3
independentemente sem um sobrescrever o outro. `notify_email` gateia o
sender `email` de `internal/notifications` — hoje só setável via API, sem
toggle na UI.

## Movimento (SSE)
Serve arquivos de gravação (incluindo snapshots `_motion.jpg`) e segmentos
HLS. Endpoints SSE por câmera: `/api/cameras/{id}/motion/live` (eventos
acima do limiar), `/api/cameras/{id}/motion/scores` (score bruto em tempo
real) e `/api/cameras/{id}/motion/region-score` (score por zona/região,
usado pelo canvas de zonas) — ver [internal/motion](../motion/README.md).

## WebRTC ao vivo (`live.go`)
`POST /api/cameras/{id}/webrtc` (`requireCameraAccess`) — corpo `{sdp}`
(offer), resposta `{sdp}` (answer), delega ao `livePublisher`
([internal/transmission/webrtc](../transmission/webrtc/README.md)) via
`WithLivePublisher`; sem publisher (câmera não-H.264 ou `live_transport=hls`)
responde `409` pro front cair pro HLS. `POST /api/settings/cameras/detect-streams`
(admin) proba a URL principal e devolve `{codec,width,height,recommended}`.

## Câmeras (`cameras.go`)
`live_transport` (`auto`/`webrtc`/`hls`) entra no create/update e volta no
`GET /api/settings`. `PUT /api/settings/cameras/reorder` (admin, rota
estática registrada antes de `PUT .../{id}` pra ter precedência no mux do Go
1.22+) reordena em lote; `display_order` não é aceito em create/update.

## Gravações e conteúdo (`recordings_global.go`, `content_days.go`, `moments.go`)
`GET /api/stats` usa `SUM(size_bytes)` de `recordings`.
`GET /api/cameras/{id}/content-days?kind=` (por câmera) e
`GET /api/content-days?cameras=&kind=` (agregado multi-câmera) devolvem
datas locais distintas com conteúdo, pros calendários habilitarem só esses
dias.

## Listagem de gravações por câmera (`handleRecordings`, `server.go`)
`GET /api/cameras/{id}/recordings?date=` lista os chunks MP4 de um dia
(`date` interpretado no fuso local, convertido pro range de `utcDay`s que
cobre esse dia) direto do filesystem, e depois enriquece cada item com dados
do banco (`ID`, `End`) via `db.EndedAtByPaths`. Dois pontos não-óbvios:

- **`ended_at` do banco sempre vence a heurística de `IsRecording` por
  request.** A heurística por request (`mtime < 30s` ou
  `!storage.IsValidMP4`) existe pra decidir "em gravação" sem esperar o
  `storage.Cleaner.syncRecordings` (roda a cada 1min) fechar a linha no
  banco. Mas ela é só um proxy — se o path já apareceu em `endedByPath`
  (presença no mapa já significa `ended_at IS NOT NULL`, `db.EndedAtByPaths`
  só seleciona essas linhas), o chunk força `IsRecording=false`
  incondicionalmente, mesmo que `storage.IsValidMP4` continue falhando nele
  (ex.: arquivo truncado por um processo de captura que travou/hangeu).
  Sem essa prioridade, um chunk corrompido por um hang fica preso em "em
  gravação" pra sempre, mesmo depois do `Cleaner` já ter confirmado que
  terminou — não é um bug específico de um protocolo de captura: qualquer
  hang que deixe um arquivo truncado o expõe. Historicamente MJPEG (HTTP
  contínuo sem heartbeat como o RTCP do RTSP) era o caso real que tornava
  isso provável na prática; o protocolo foi removido do projeto por inteiro
  (`chore/remover-mjpeg-backend`), mas a lógica de prioridade aqui continua
  válida pra qualquer hang de rede/processo, não era exclusiva dele.
- **A varredura por dia também escaneia o dia UTC anterior a cada
  `utcDay` do range** (deduplicando datas repetidas quando o range já
  cobre dias consecutivos), aplicando o mesmo filtro de timestamp de
  sempre (`ts` fora de `[dayStart, dayEnd)` é descartado) pra decidir
  inclusão — só o conjunto de diretórios escaneados muda, não o critério
  de quem pertence ao dia. Existe porque `Recorder` fixa `OutputDir` no
  início do processo: um chunk cujo timestamp (no nome do arquivo) já é do
  dia D pode ficar fisicamente na pasta do dia D-1 se o processo não rolou
  a tempo da meia-noite UTC. Sem esse fallback o chunk fica invisível pra
  qualquer consulta por aquele dia — o que também alimentava o bug acima
  indiretamente, pois um chunk mais antigo (ainda visível) podia ser
  avaliado, errado, como "o último". Mesma lógica que `findRecordingPath`
  (usado só por `handleDeleteRecording`, pra achar 1 arquivo específico) já
  usava — generalizada aqui pra toda a listagem do dia.

`GET /api/cameras/{id}/recordings/by-id/{recording_id}` (`handleRecordingByID`)
e `DELETE /api/cameras/{id}/recordings/{filename}` (`handleDeleteRecording`,
admin) são endpoints vizinhos no mesmo arquivo, não cobertos por este
enriquecimento (operam sobre um recording já identificado, não uma listagem).

## Relatórios agregados (`handleEventReport`, `reports.go`)
`GET /api/reports/events?camera=&bucket=` recebe `camera` como query param,
não path `{id}` — por isso não passa pela middleware `authCamera` (que só
enxerga `r.PathValue("id")`, ver "Rotas" acima). O handler chama
`s.canAccessCamera(r, camera)` manualmente quando `camera != ""` e responde
`403` antes de qualquer agregação, replicando à mão a mesma proteção que os
endpoints `{id}`-based ganham de graça via `guard()`. Vale como lembrete
geral: qualquer rota nova que aceite um ID de câmera fora do path (query
param ou corpo) precisa desse mesmo cuidado manual — o gate declarativo da
tabela de rotas não cobre esse caso.

## Device info (`device_info.go`)
`GET /api/cameras/{id}/device-info` / `POST .../device-info/refresh`
(admin) — ver [internal/deviceinfo](../deviceinfo/README.md). Coleta
dispara automaticamente em background no cadastro
(`captureDeviceInfoAsync`).

## Trainers e fine-tuning (`trainers.go`, `finetune.go`)
`trainers.go`/`finetune.go` — CRUD de trainers e disparo de fine-tuning de
object detection, ver [internal/trainer](../trainer/README.md).

## Build info e atualização (`server.go`, via [internal/release](../release/README.md))
`GET /api/about` expõe `version`/`commit`/`builtAt` (`-ldflags`) +
`uptime_seconds`/`go_version` + `release_notes_version`/`release_notes_md`
(a versão EXATA instalada, via `internal/release.NotesFetcher` — diferente
do `updateChecker`, que só vê a "latest").

## Ver também
- [internal/notifications](../notifications/README.md), [internal/db](../db/README.md), [internal/release](../release/README.md), [internal/deviceinfo](../deviceinfo/README.md), [internal/trainer](../trainer/README.md) — os domínios que este pacote expõe via HTTP.
