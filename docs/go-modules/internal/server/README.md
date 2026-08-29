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

## Headers de segurança (`setSecurityHeaders`, `server.go`)
`ServeHTTP` chama `setSecurityHeaders(w)` incondicionalmente, antes de
qualquer outra coisa (mesmo ponto onde `setCORSHeaders` já é aplicado pra
`/api/*`) — vale pra TODA resposta do servidor, não só a API: HSTS
(`max-age=31536000; includeSubDomains`), `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
`Cross-Origin-Opener-Policy: same-origin` e a CSP (abaixo). Existe porque a
instalação típica roda exposta publicamente com domínio + TLS próprios (não
uma API interna atrás de VPN) — sem `frame-ancestors`/`X-Frame-Options` a
tela de login seria embutível num `<iframe>` de terceiros (clickjacking
contra o admin). O HSTS é enviado sem checar `r.TLS`: por spec (RFC 6797
§7.2) o navegador ignora o header numa conexão não-segura, e checar
`r.TLS != nil` seria pior aqui — o deployment típico termina TLS num reverse
proxy, então `r.TLS` no processo Go fica `nil` mesmo em produção real, o que
quebraria o HSTS justamente no caso que ele deveria cobrir.

**CSP** (`contentSecurityPolicy`, mesma função): `default-src 'self';
script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:
blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:;
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src
'none'`. Duas diretivas exigem justificativa não-óbvia: `worker-src blob:`
porque `hls.js` (`Player.tsx`, fallback HLS, `enableWorker` default) cria
seu Web Worker via `URL.createObjectURL`; `style-src 'unsafe-inline'` porque
`react-grid-layout` (grid do Live View) posiciona cada tile via `style=""`
inline computado em runtime (drag) — nonce/hash é inviável pra estilo
recalculado a cada frame. `blob:` em `img-src`/`media-src` é margem
deliberada sem uso real hoje (nenhum `<img src="blob:">`/`<video
src="blob:">` no código — `usePlayerSnapshot.ts` só cria `blob:` pra um `<a
download>`, fora do que essas diretivas regem; WebRTC usa `srcObject`, não
`src=`); mantida porque não amplia superfície de ataque (uma URL `blob:` só
existe se a própria página a criar, sempre same-origin). Sem `stun:`/`turn:`
no frontend (WebRTC não configura ICE server externo), `connect-src 'self'`
já cobre todo `fetch`/`EventSource` do app.

## robots.txt e cache de assets (`robots.go`, `spaHandler`)
`GET /robots.txt` (rota exata em `routeTable()` — tem precedência sobre o
catch-all `/` no `net/http.ServeMux` do Go 1.22+, então nunca cai no
`spaHandler`) devolve `text/plain` com `User-agent: *\nDisallow: /`:
sistema privado (câmeras domésticas), nega indexação por completo. Sem essa
rota o `GET /robots.txt` caía no `spaHandler` e devolvia `index.html`
(HTML) em vez de um robots.txt de verdade. `spaHandler` também seta
`Cache-Control: public, max-age=31536000, immutable` pros arquivos sob
`assets/` (JS/CSS com hash de conteúdo no nome, convenção do Vite — um
build novo nunca reaproveita o mesmo nome, seguro cachear pra sempre);
outros estáticos na raiz do dist (`favicon.svg`, `manifest.json`, sem hash)
continuam sem esse header — diferente do `Cache-Control: no-cache,
must-revalidate` de `index.html` (ver "Build info e atualização" abaixo).

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

`GET /api/me/preferences` também devolve `telegram_motion_notify_enabled`
(via `telegramGateStatus`, ver "Vínculo de conta Telegram" abaixo — reflete
se o usuário tem pelo menos 1 câmera com notificação de movimento por
Telegram habilitada, `db.UserHasAnyCameraMotionTelegramNotifyEnabled`) e
`push_subscribed` (`len(db.ListPushSubscriptionsForUser(...)) > 0`). Os dois
alimentam a seção `Preferências > Testes` do frontend (ver
[docs/frontend/preferences-tests.md](../../../frontend/preferences-tests.md)),
que decide se cada botão de teste vem habilitado sem precisar confiar em
estado local do navegador (ex. o registro do Service Worker, que já provou
divergir do que o backend tem salvo).

## Notificações de movimento por canal dedicado (`motion_notify.go`)
`NotifyCameraMotion` — chamado de `cmd/camera/main.go`'s `onMotionEvent`
DEPOIS que `db.FindRecordingCoveringMotion` já confirmou que uma gravação
cobre o evento (mesmo gate "só notifica quando tem gravação" do sino SSE e
do badge Momentos) — despacha pros dois canais DEDICADOS wired em `Server`
(`telegramSender`, `webpushSender`; nunca o `Dispatcher` genérico, que
despacharia também pro sino sempre-ativo). Os dois canais resolvem
destinatários de formas diferentes e falham independentemente (erro/
ausência de um nunca bloqueia o outro): `telegramMotionRecipients` exige
opt-in explícito por câmera com score mínimo
(`db.ListCameraMotionTelegramNotifyPrefs`); `webpushMotionRecipients` não
tem preferência por câmera — todo usuário com acesso (admin sempre, viewer
com grant via `db.UserHasCamera`) é destinatário, já que a permissão do
navegador concedida ao assinar push (ver
[internal/notifications/webpush](../notifications/webpush/README.md)) É o
opt-in. A mensagem também diverge por canal:
`telegramMotionMessage` monta HTML (`parse_mode=HTML`, link só quando
`PublicURL` está configurado); o corpo do Webpush é texto plano
(`"<câmera> · <data/hora> · <score>%"`) — nunca a mesma string formatada
pros dois, pra não vazar markup no popup do SO.

## Web Push (`push.go`)
`GET /api/me/push/vapid-public-key` (`authFull`) devolve a chave pública da
instância, gerando-a (e persistindo) no primeiro uso via
`webpush.GetOrCreateVAPIDKeys` — nunca regenerada depois (ver
[internal/notifications/webpush](../notifications/webpush/README.md)).
`POST /api/me/push/subscription` decodifica o objeto que
`PushSubscription.toJSON()` do navegador produz (`{endpoint, keys:
{p256dh, auth}}`) e chama `db.UpsertPushSubscription` pro usuário
autenticado (upsert por endpoint — assinar de novo do mesmo dispositivo
atualiza, não duplica). `DELETE /api/me/push/subscription` chama
`db.DeletePushSubscriptionForUser(s.currentUserID(r), body.Endpoint)` —
escopado pelo usuário autenticado de propósito, nunca por um endpoint livre
no corpo, senão um usuário poderia remover a subscription de outro só
reusando/adivinhando o endpoint.

`POST /api/me/push/test` (`authFull`, `Preferências > Testes`) rechecha
server-side que existe pelo menos 1 subscription salva (409 se não houver,
ou se `s.webpushSender` for `nil` nesta instância) antes de chamar
`s.webpushSender.Send` com uma notificação de teste genérica — nunca confia
que o frontend já filtrou, mesmo espírito do recheck de
`fix/apply-update-recheck-fresco`.

## Extensões: `Available` vs `Active`, sincronizado no boot (`extensions.go`)
`GET /api/settings/extensions` devolve `extensionsMeta()` — uma slice fixa
(só 2 extensões existem hoje: `telegram`, `s3`; regra dos três, `CLAUDE.md`,
nada de registry) de `extensionDTO{ID, Name, Category, Description,
Available, Active}`. `Available` é calculado de `s.extensionsCfg` (o
`camera.yaml` de bootstrap — "permitida nesta instância", ex.
`Telegram.Enabled && BotToken != ""`); `Active` é o toggle "Ativado" que o
admin liga/desliga em `Preferências > Extensões`
(`PUT /api/settings/extensions/{id}`), persistido em `system_config` via
`db.GetExtensionActive`/`SetExtensionActive` (ver
[internal/db](../db/README.md)). Os dois são conceitos deliberadamente
distintos — mudar o yaml sozinho não mexe no toggle persistido, que
sobrevive a reinícios.

`SyncExtensionsFromConfig()` reconcilia os dois no boot: para cada
extensão, força `Active := Available`, nos DOIS sentidos (liga o que o
yaml passou a habilitar, desliga o que deixou de habilitar) — mesmo que
isso sobrescreva um toggle que o admin tinha ligado manualmente pela UI
num boot anterior sem editar o yaml (efeito aceito: `camera.yaml` é a
fonte de verdade a cada reinício, decisão do navigator). Chamada uma
única vez em `cmd/camera/main.go`, logo após o server ganhar
`WithExtensionsConfig`/`WithDB` e ANTES do `http.ListenAndServe` — evita
corrida com um `PUT /api/settings/extensions/{id}` concorrente. Erro só
gera `slog.Warn`, nunca é fatal (conveniência de coerência yaml↔banco, não
crítica pro boot); sem `s.db` configurado, é no-op. Efeito colateral
positivo: como `internal/storage.Cleaner` também lê
`db.GetExtensionActive(c.db, "s3")` pra decidir sobre upload S3 (ver
[internal/storage](../storage/README.md)) e é construído depois desse
sync no fluxo de boot, ele já enxerga o valor corrigido automaticamente,
sem nenhuma mudança própria.

## Vínculo de conta Telegram (`telegram_link.go`)
`POST /api/me/telegram/link` (`authFull`) gera um código de uso único
(`db.SetTelegramLinkCode`, TTL de 10min) e devolve o deep-link
`t.me/<bot>?start=<código>` — abrir essa URL faz o Telegram enviar
`/start <código>` pro bot, que um poller resolve de volta pro usuário
autenticado. `POST /api/me/telegram/unlink` limpa o `chat_id` vinculado sem
checar `Active` de propósito (ver abaixo). O handler de link valida, nessa
ordem, `Available` (`Enabled && BotToken != ""`, config de instância) **e**
`db.GetExtensionActive(s.db, "telegram")` (toggle "Ativado" em
`Preferências > Extensões`, ver "Extensões: `Available` vs `Active`" acima),
devolvendo 503 em qualquer um dos dois casos — história
`fix/gate-telegram-link-por-extensao-ativa` fechou a checagem de `Active`,
que faltava (dava pra vincular uma conta com o toggle desligado). O gate de
visibilidade equivalente no front (`TelegramLinkSection`, ver
[docs/frontend/users-profile.md](../../../frontend/users-profile.md)) é só
UX — esta validação no handler é a garantia real. `handleTelegramUnlink`
continua sem checar `Active` deliberadamente: desvincular precisa funcionar
mesmo com a extensão desativada, senão um `chat_id` fica órfão no banco sem
nenhuma forma de removê-lo.

`telegramGateStatus(userID)` resolve os 3 pedaços de estado que decidem se
um usuário pode receber notificação de movimento por Telegram — extensão
ativa (`db.GetExtensionActive`), conta vinculada (`chat_id` via
`db.GetUserTelegramChatInfo`) e pelo menos 1 câmera com opt-in
(`db.UserHasAnyCameraMotionTelegramNotifyEnabled`) — e é o único ponto que
lê essa combinação: `handleGetPreferences` reusa pra informar o frontend
(ver "Preferências do usuário" acima) e `handleTelegramTest`
(`POST /api/me/telegram/test`, `authFull`, `Preferências > Testes`) reusa
pra rechecar o gate completo antes de enviar de verdade, devolvendo 409 com
mensagem clara (ou se `s.telegramSender` for `nil` nesta instância) em vez
de deixar `telegramSender.Send` silenciosamente não fazer nada e parecer um
teste bem-sucedido que não entregou nada.

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

## Configurações de armazenamento (`storage_settings.go`)
`PUT /api/settings/storage` recebe os 5 campos numéricos de retenção/limite
(`with_motion_minutes`, `without_motion_minutes`, `interval_minutes`,
`max_size_gb`, `warn_percent`, todos ponteiros — `nil` = campo não enviado,
não sobrescreve o que já está persistido) e valida via
`validateStorageSettings` **antes** de qualquer `db.SetConfig`, mesmo padrão
de `validateMotionConfig` (`cameras.go:18-38`): os 4 primeiros exigem `>= 0`,
`warn_percent` exige `[0, 100]`; a primeira violação encontrada vira `400`
(`text/plain`) citando o campo e o valor recebido. Existe porque o
`min={0}`/`max={100}` dos inputs em `StorageSettingsPage.tsx` é só validação
client-side (HTML, contornável) — sem checagem server-side um valor negativo
era aceito e persistido sem erro (história
`fix/validacao-storage-negativo`, achado durante e2e do CA-07). A validação
roda sobre o `input` inteiro antes do primeiro `db.SetConfig`, garantindo que
nenhum dos 5 campos do payload é parcialmente persistido se outro campo do
mesmo request falhar.

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

## Build info e atualização (`server.go`, via [internal/release](../release/README.md))
`GET /api/about` expõe `version`/`commit`/`builtAt` (`-ldflags`) +
`uptime_seconds`/`go_version` + `release_notes_version`/`release_notes_md`
(a versão EXATA instalada, via `internal/release.NotesFetcher` — diferente
do `updateChecker`, que resolve "a release mais recente publicada", de
qualquer canal). `commit` também é o valor que o frontend usa pra detectar
build divergente (`useForceReloadOnStaleBuild`, ver
[docs/frontend/README.md](../../../frontend/README.md)).

`GET /api/updates` (admin) devolve `s.updateChecker.Status()` (cache do
`Run` periódico do checker — atualizado só a cada `interval`, em horas).

`POST /api/updates/apply` (admin, `handleApplyUpdate`) **não confia nesse
cache** pra decidir se aplica: primeiro chama `s.updateChecker.Check(ctx)`
síncrono, no próprio request, forçando uma busca fresca contra a API do
GitHub (que também atualiza o cache interno do checker como efeito
colateral). Só depois lê `Status().UpdateAvailable` e monta o `Apply()`
com o `manifest` que `Check` acabou de retornar (nunca o cacheado) e
`s.updateChecker.DownloadBase()` — a base de download vem do que o checker
efetivamente resolveu como release mais recente (ver
[internal/release](../release/README.md)), nunca um atalho fixo pra
"estável", senão a aplicação baixaria o binário errado sempre que a
atualização detectada fosse uma pré-release. As interfaces
`updateStatuser`/`applyRunner` (definidas no consumidor, não no produtor)
refletem essa dependência: `Check(ctx) (release.Manifest, error)`,
`DownloadBase() string` e `Apply(ctx, m, baseURL) error`.

**Por que o recheck é síncrono no clique, não só no `Run` periódico:**
`scripts/release-candidate.sh` recorta a mesma tag flutuante `-rc` de novo
(`git push --force` + upsert da release no GitHub) sem trocar de versão —
se isso acontece entre dois checks periódicos, o manifesto cacheado aponta
pro checksum ANTIGO. Clicar em "Atualizar agora" baixava o binário NOVO mas
validava contra o checksum VELHO: `applier.Apply` falhava (só logado) e a
tela ficava presa em "Atualizando…" pra sempre, sem o servidor reiniciar
(incidente real em produção, história `fix/apply-update-recheck-fresco`).
O recheck fresco elimina a causa: a decisão "há atualização?" e o manifesto
usado no `Apply()` sempre refletem o estado do GitHub no exato momento do
clique, nunca um snapshot de até `interval` horas atrás.

**Resultado do apply vira evento** (`EventUpdateApplied`/`EventUpdateFailed`,
consts deste pacote): a goroutine que chama `s.applier.Apply(...)` publica
um dos dois no `events.Bus` (`WithEvents`, mesmo padrão chainable de
`recorder.Recorder`/`hls.HLSStreamer`; `s.events == nil` é no-op seguro,
publish nunca é obrigatório) ao terminar — sucesso ou falha por qualquer
motivo (checksum, rede, disco cheio no self-replace). `internal/alerts`
assina os dois e traduz em notificação pra todo admin (ver
[internal/alerts](../alerts/README.md)), fechando o incidente também pro
sintoma: antes disso um `Apply()` que falhasse só ia pro log, e a tela
ficava presa em "Atualizando…" sem o usuário nunca saber o motivo. O `Data`
do `EventUpdateFailed` carrega a mensagem real do erro (`err.Error()`), não
só o tipo — quem assina o SSE de progresso (abaixo) repassa isso ao
frontend em vez de um texto genérico.

**Progresso granular do apply via SSE** (`GET /api/updates/apply/live`,
admin, `handleUpdateApplyLive`): mescla num único stream o
`EventUpdateStep` (const deste pacote, publicado por `cmd/camera/main.go`
a cada chamada do `updater.Applier.OnStep` — ver
[internal/updater](../updater/README.md) — com o nome de cada fase:
`downloading`/`snapshot`/`replacing`/`restarting`) e o `EventUpdateFailed`
já existente. Mesmo esqueleto de `handleNotificationsLive`/
`handleMotionLive` (headers SSE, `Subscribe`/`defer unsubscribe`, `select`
com `r.Context().Done()`), mas sem roteamento por usuário: só um apply
roda por vez, é um processo único, não precisa isolar por quem está
olhando. `EventUpdateStep` é deliberadamente um tipo à parte de
`EventUpdateApplied`/`EventUpdateFailed` — o mapa de tradução de
`internal/alerts` é fechado por tipo, então um step intermediário nunca
vira notificação espúria por engano; só este handler assina esse tipo. O
sucesso do apply nunca chega por este SSE: em self-replace o `Reexec` mata
o processo depois do step `restarting`, e é a própria queda de conexão
(esperada) que o frontend usa como sinal — a confirmação real é o
`EventSource` reconectando sozinho contra o processo novo já de pé (ver
`UpdateProgressModal` em
[docs/frontend/about-updates.md](../../../frontend/about-updates.md)).

`spaHandler` (também em `server.go`) seta `Cache-Control: no-cache,
must-revalidate` na resposta de `index.html` (não `no-store`: permite
revalidação condicional, só nunca serve uma cópia em cache sem checar o
servidor primeiro). Existe pra garantir que um `window.location.reload()`
disparado pelo frontend por build divergente realmente busque HTML fresco —
sem isso o reload podia servir uma cópia em cache no meio do caminho e não
resolver nada. Não afeta cache dos assets JS/CSS com hash de conteúdo do
Vite (esses continuam cacheáveis à vontade, já são imunes a staleness pelo
próprio nome do arquivo).

## Ver também
- [internal/notifications](../notifications/README.md), [internal/notifications/webpush](../notifications/webpush/README.md), [internal/db](../db/README.md), [internal/release](../release/README.md), [internal/deviceinfo](../deviceinfo/README.md), [internal/extensions](../extensions/README.md), [internal/storage](../storage/README.md) — os domínios que este pacote expõe via HTTP.
- [internal/events](../events/README.md) — barramento que este pacote publica via `WithEvents`/`publishEvent` (`EventUpdateApplied`/`EventUpdateFailed`/`EventUpdateStep`).
- [internal/alerts](../alerts/README.md) — assina esses eventos e importa este pacote só pelas consts de tipo (sem ciclo: `server` não importa `alerts`).
- [docs/frontend/preferences-tests.md](../../../frontend/preferences-tests.md) — consumidor de `telegramGateStatus`/`handleTelegramTest`/`handlePushTest`.
