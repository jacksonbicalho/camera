# docs/go-modules

Documentação por pacote Go do os-camera — um `README.md` por diretório real de
`internal/`, incluindo os diretórios "pai" que agrupam mais de um subpacote
(`capture`, `transmission`, `notifications`, `db`).

**Esta árvore é a fonte de verdade** sobre cada pacote — o `CLAUDE.md` só
referencia o arquivo/seção correspondente quando precisa do assunto, nunca
duplica o conteúdo (mesmo padrão já usado com `docs/workflow.md`).

Construída incrementalmente por cluster de pacotes relacionados (ver
`work_progress/analysis/202608091752_docs-go-modules.md`); verificada por
`scripts/docs-go-modules-check.sh`. Alguns links abaixo apontam pra páginas que
ainda serão escritas nos próximos tickets desta história — o índice nasce
completo, o conteúdo chega por cluster.

## Infraestrutura
- [internal/core](internal/core/README.md)
- [internal/config](internal/config/README.md)
- [internal/exec](internal/exec/README.md)
- [internal/ffprobe](internal/ffprobe/README.md)
- [internal/logger](internal/logger/README.md)

## Captura, gravação, transmissão e movimento
- [internal/capturer](internal/capturer/README.md)
  - [internal/capturer/rtsp](internal/capturer/rtsp/README.md)
  - [internal/capturer/hls](internal/capturer/hls/README.md)
- [internal/recorder](internal/recorder/README.md)
- [internal/transmission](internal/transmission/README.md)
  - [internal/transmission/hls](internal/transmission/hls/README.md)
  - [internal/transmission/webrtc](internal/transmission/webrtc/README.md)
- [internal/motion](internal/motion/README.md)
- [internal/zones](internal/zones/README.md)
- [internal/discovery](internal/discovery/README.md)

## Dados e armazenamento
- [internal/db](internal/db/README.md)
  - [internal/db/migrations](internal/db/migrations/README.md)
- [internal/dbbackup](internal/dbbackup/README.md)
- [internal/storage](internal/storage/README.md)
- [internal/deviceinfo](internal/deviceinfo/README.md)

## Aplicação e entrega
- [internal/server](internal/server/README.md)
- [internal/notifications](internal/notifications/README.md)
  - [internal/notifications/application](internal/notifications/application/README.md)
  - [internal/notifications/email](internal/notifications/email/README.md)
  - [internal/notifications/webpush](internal/notifications/webpush/README.md)
- [internal/email](internal/email/README.md)
- [internal/release](internal/release/README.md)
- [internal/updater](internal/updater/README.md)

## Extensões
- [internal/extensions](internal/extensions/README.md)
  - [internal/extensions/telegram](internal/extensions/telegram/README.md)
