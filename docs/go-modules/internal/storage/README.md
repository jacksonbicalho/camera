# internal/storage

`Cleaner`: retenção diferenciada por categoria (com/sem movimento),
sincronização do filesystem com o banco, e suporte a drives S3 pra
arquivamento. Também dono do sender `application` de
[internal/notifications](../notifications/README.md) via `WithNotifications`
(aviso de disco quase cheio).

## Sincronização filesystem ↔ banco
`syncRecordings()` varre o filesystem e sincroniza MP4s pra `recordings`
(`INSERT OR IGNORE`), atualizando `has_motion` via join com `motion_events`.
`cleanFromDB()` consulta `recordings` pras decisões de exclusão (`AND
ended_at IS NOT NULL` — nunca processa o arquivo em gravação).
`IsValidMP4(path)` (`mp4.go`) sonda o átomo `moov` (só lê cabeçalhos de
átomo) pra saber se um MP4 foi fechado de verdade pelo ffmpeg — o recorder
usa `-f segment` (processo de longa duração, rotação 100% interna), então o
chunk ATIVO aparece no `os.ReadDir` sem `moov` ainda. Usado em
`syncRecordings()` (remove chunk corrompido com sucessor conhecido — "ffmpeg
morreu no meio") e em `internal/server` (`findChunkForTime`/`handleRecordings`
— sem isso, extrair frame do chunk que ainda está sendo escrito falhava
sempre).

## Retenção e limpeza
Ação configurável por categoria (`delete` ou `send_to_drive`): um drive S3
só entra no mapa de destinos se `db.GetExtensionActive(c.db, "s3")` for
`true` — mesmo com uma config de destino salva em `retention_extensions`,
a extensão desativada (toggle "Ativado" em Preferências > Extensões) não
deve fazer upload nenhum (achado real: antes dessa checagem,
`loadDrives()` montava o drive só a partir da linha existir, ignorando o
toggle por completo). Sem o drive no mapa, `cleanFromDB()` cai no mesmo
fallback seguro de quando o drive referenciado não existe (arquivo fica
retido, sem upload nem delete). Como `Cleaner` é construído no boot depois
de `internal/server.Server.SyncExtensionsFromConfig` já ter reconciliado
esse toggle com o `camera.yaml` (ver [internal/server](../server/README.md)),
ele sempre lê o valor já corrigido, sem nenhuma lógica própria de sync.
`uploadAndPurge()` faz upload S3, apaga o MP4 e chama `purgeMotionAssets()`
(apaga JPEGs + linhas de `motion_events` órfãs — chamado também pelo caminho
de chunk corrompido, pra nunca deixar um `_motion.jpg` órfão).
`sweepOrphanedMotionDirs()` é uma rede de segurança em disco, independente
do banco: remove diretórios de eventos cuja câmera já não existe mais, com
remoção em cascata de diretórios de mês/ano vazios (nunca a pasta raiz da
câmera). `slugify()` translitera acentos (`ã→a`) pro prefixo do objeto S3.
Sem banco disponível: consulta `motion.ndjson` diretamente (modo legado).

## Segmentos e gravações órfãs no boot
`CleanOrphanedSegments(segmentsPath, validCameraIDs)` roda no boot (após
carregar câmeras) e apaga dirs de `segments_path` sem câmera correspondente
no banco. `CleanOrphanedRecordings` (`orphan.go`, chamada ANTES do
recorder/cleaner subirem) apaga MP4s incompletos deixados no disco quando o
sistema parou no meio de uma gravação (`ended_at IS NULL`) — precisa rodar
antes pra `syncRecordings()` não atribuir um `ended_at` a esses arquivos com
um MP4 corrompido/incompleto.

## Ver também
- [internal/db](../db/README.md) — tabelas `recordings`/`motion_events` que este pacote sincroniza/limpa.
- [internal/recorder](../recorder/README.md) — produz os MP4 que este pacote gerencia.
- [internal/notifications](../notifications/README.md) — canal do aviso de disco quase cheio.
- [internal/server](../server/README.md) — sincroniza o toggle "Ativado" da extensão S3 com `camera.yaml` no boot (`SyncExtensionsFromConfig`), antes deste pacote ser construído.
