# internal/exec

Interfaces `Commander`/`Process` e a implementação real (`FFmpegCommander`)
sobre `os/exec`, usadas por qualquer processo ffmpeg de longa duração
(`internal/recorder`, `internal/transmission/hls`, `internal/motion`). Injetadas
nos pacotes consumidores para permitir testes sem ffmpeg de verdade (fakes
implementam as mesmas duas interfaces).

Diferente de `internal/core.Executor` (execução única, captura stdout e
retorna) — aqui o processo fica rodando (streaming/gravação) e precisa de
parada graciosa.

## Arquivos principais
- `exec.go` — as interfaces `Process`/`Commander` e `FFmpegCommander` (o tipo
  concreto; `Start`/`Terminate` vivem nos arquivos por plataforma abaixo).
- `exec_unix.go` — `Start` (seta `Setpgid` pra poder sinalizar o grupo inteiro,
  descarta stdout/stderr, abre um pipe de stdin) e `Terminate` (parada graciosa
  de duas camadas: primeiro escreve `"q\n"` no stdin — comando interativo do
  próprio ffmpeg pra fechar o arquivo de saída corretamente — depois `SIGINT`
  no grupo de processos; cai pro processo individual se o grupo falhar).
- `exec_windows.go` — equivalente pra Windows (sem `Setpgid`/`syscall.Kill` de
  grupo, que não existem nessa plataforma).

## Ver também
- [internal/core](../core/README.md) — irmão pra execução única (captura stdout, sem processo de longa duração).
- [internal/recorder](../recorder/README.md), [internal/motion](../motion/README.md), [internal/transmission/hls](../transmission/hls/README.md) — consumidores.
