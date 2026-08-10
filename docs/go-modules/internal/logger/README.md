# internal/logger

Constrói o `*slog.Logger` da aplicação a partir de `config.LogConfig`, com
dois modos de saída configuráveis via `camera.yaml` (chave `log:`).

## Arquivos principais
- `logger.go` — `New(opts Options)`:
  - `output: stdout` — JSON direto em stdout, nível `Info` (ou `Debug` com
    `debug: true`).
  - `output: file` — um arquivo por nível (`debug.log`/`info.log`/`warn.log`/`error.log`)
    no diretório configurado, cada um com **rotação própria** via
    `gopkg.in/natefinch/lumberjack.v2` (`max_size_mb`/`max_age_days`/`max_backups`/`compress`,
    resolvidos com defaults via `config.LogConfig`'s accessors `*OrDefault` —
    ponteiros distinguem "ausente" de `0`=ilimitado). `multiHandler`/`levelHandler`
    são o cimento que faz um único `*slog.Logger` escrever no arquivo certo por
    nível — cada `levelHandler` só aceita registros do seu próprio nível
    exato (não "≥"), e o `multiHandler` distribui pra todos.

## Ver também
- [internal/config](../config/README.md) — `LogConfig`, a fonte dos `Options`.
