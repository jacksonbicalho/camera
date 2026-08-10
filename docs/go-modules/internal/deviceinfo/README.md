# internal/deviceinfo

Captura metadados de hardware/manutenção da câmera logo após o cadastro
(`captureDeviceInfoAsync`, disparado em background por `handleCreateCamera`).

## Formato de saída
Um `map[string]string` plano de chaves namespaced (`model`, `serial`,
`firmware`, `mac`, `ntp.enabled`, `timezone`, `stream.main.gop`,
`stream.sub.*`, e no futuro `capability.zoom`, `url.config`, `ptz.*`) + o
dump bruto completo sob `raw.*` — EAV, então modelos diferentes guardam o que
expõem sem mudar schema (persistido em `camera_device_info`, ver
[internal/db](../db/README.md)).

## Arquivos principais
- `deviceinfo.go` — `Collector` (interface `Name`/`Detect`/`Collect` — o
  "tipo" extensível por família de câmera) e `Collect` (escolhe o primeiro
  collector que dá `Detect`, marca `collector=<nome>`, mescla as chaves
  `stream.main.*` do `ffprobe` por cima — só preenche as ausentes; fallback
  `collector=generic` quando nenhum collector casa).
- `dahua.go`/`cgi.go` — o único collector hoje: CGI Intelbras/Dahua, cliente
  HTTP com autenticação digest.

## Ver também
- [internal/db](../db/README.md) — tabela `camera_device_info` (EAV).
- [internal/ffprobe](../ffprobe/README.md) — `stream.main.*` mesclado por cima do dump bruto.
