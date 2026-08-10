# internal/storage

`Cleaner`: retenção diferenciada por categoria (com/sem movimento, estado),
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
Ação configurável por categoria (`delete` ou `send_to_drive`):
`uploadAndPurge()` faz upload S3, apaga o MP4 e chama `purgeMotionAssets()`
(apaga JPEGs + linhas de `motion_events` órfãs — chamado também pelo caminho
de chunk corrompido, pra nunca deixar um `_motion.jpg` órfão).
`sweepOrphanedMotionDirs()`/`sweepOrphanedStateDirs()` são redes de segurança
em disco, independentes do banco: removem diretórios de eventos/histórico
cujo dono (câmera/classificador) já não existe mais, com remoção em cascata
de diretórios de mês/ano vazios (nunca a pasta raiz da câmera).
`purgeStateHistory()` apaga transições de `camera_state_history` mais velhas
que a retenção efetiva por classificador (`history_retention_minutes` —
override nullable — ou o default global `storage.state_history_minutes`,
`system_config`). `slugify()` translitera acentos (`ã→a`) pro prefixo do
objeto S3. Sem banco disponível: consulta `motion.ndjson` diretamente (modo
legado).

## Segmentos e gravações órfãs no boot
`CleanOrphanedSegments(segmentsPath, validCameraIDs)` roda no boot (após
carregar câmeras) e apaga dirs de `segments_path` sem câmera correspondente
no banco. `CleanOrphanedRecordings` (`orphan.go`, chamada ANTES do
recorder/cleaner subirem) apaga MP4s incompletos deixados no disco quando o
sistema parou no meio de uma gravação (`ended_at IS NULL`) — precisa rodar
antes pra `syncRecordings()` não atribuir um `ended_at` a esses arquivos e
torná-los elegíveis pra análise YOLO com um MP4 corrompido/incompleto.

## Análise automática de novas gravações
`AnalyzeNew`/`analyzeNewRecordings` (`cleaner.go`, chamada periodicamente
dentro de `Run()`) consulta gravações com `has_motion=1` e
`camera_analysis_config.enabled=1` sem detecção ainda, dispara o detector
configurado (YOLO ou Hugging Face, via `WithAnalyzer`/`WithDetectorFactory`),
grava as `detections` e rotula eventos de movimento sem label — pra Hugging
Face, escolhe o melhor snapshot de movimento do intervalo
(`huggingFaceImagePath`) em vez do frame médio do vídeo.

## Ver também
- [internal/db](../db/README.md) — tabelas `recordings`/`motion_events`/`camera_state_history` que este pacote sincroniza/limpa.
- [internal/recorder](../recorder/README.md) — produz os MP4 que este pacote gerencia.
- [internal/notifications](../notifications/README.md) — canal do aviso de disco quase cheio.
