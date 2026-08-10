# internal/config

Lê o arquivo de bootstrap (`camera.yaml`) com porta, `db_path`, storage e
credenciais do admin, e define os tipos de configuração compartilhados por todo
o resto da aplicação — câmeras, movimento, storage, log, SMTP. Variáveis de
ambiente (prefixo `OS_CAMERA_`) sobrescrevem campos específicos após o parse do
YAML (ver tabela completa no `CLAUDE.md`, seção "Variáveis de ambiente").

Câmeras, motion e zonas de exclusão em si são gerenciados via UI/API e vivem no
banco de dados — este pacote só define o `CameraConfig` (o shape em memória) e
seus accessors "Effective*", não a persistência.

## Arquivos principais
- `config.go` — `Config` (raiz do YAML: `debug`, `timezone`, `db_path`, `log`,
  `server`, `storage`, `admin`, `smtp`), `CameraConfig` (shape de câmera
  compartilhado por todo o app) com seus accessors `Effective*`/`*OrDefault`
  (ex.: `EffectiveCaptureType` default `"rtsp"`, `EffectiveLiveTransport`
  default `"auto"`, `EffectiveMotionURL` cai pra `RTSPURL` quando
  `MotionRTSPURL` está vazio), `LogConfig` (ponteiros distinguem "ausente" de
  zero explícito — ver `internal/logger`), `SMTPConfig`, `Load(path)` (parse do
  YAML + overrides de env var).
- `entries.go` — `Config.Entries()`: devolve os campos operacionais do
  bootstrap como pares `{chave-pontuada, valor}` pro comando `camera config`;
  nunca expõe a senha do admin nem o `jwt_secret` em si (só o modo: gerado a
  cada boot vs. fixo).

## Ver também
- [internal/logger](../logger/README.md) — consome `LogConfig`.
- [internal/db](../db/README.md) — persiste o que NÃO está no bootstrap (câmeras, usuários, settings).
