# internal/release

Checagem de atualização disponível e busca de changelog — puramente HTTP
contra o GitHub Releases, sem git/gh no processo.

## Arquivos principais
- `checker.go` — `Checker`/`NewChecker(url, current, client)`: busca
  periodicamente (`Run(ctx, interval)`) a lista completa de releases via
  `DefaultReleasesAPIURL` (API REST do GitHub, `GET /repos/.../releases` —
  ao contrário do atalho estático `/releases/latest`, inclui pré-releases),
  escolhe a de maior `created_at` ignorando `draft` (`newestRelease`), busca
  o `version.json` anexado a ELA especificamente via `browser_download_url`
  do próprio asset (`findAsset`, nunca uma URL adivinhada por convenção) e
  cacheia o `Manifest` decodificado + a base de download dessa release
  (`downloadBase`, exposta por `DownloadBase()`) + um `Status` (snapshot
  seguro pra serializar, incluindo `UpdateAvailable`). `OnCheck`, se
  definido, roda ao fim de cada `Check` (é aqui que `main.go` liga
  `Server.NotifyUpdateAvailable`). `UpdateAvailable` é `true` quando o
  semver da release resolvida é maior que `current`, OU quando é a MESMA
  versão mas `created_at` dessa release é posterior a `CurrentBuiltAt`
  (campo público, RFC3339, setado por `main.go` — mesmo padrão de
  `OnCheck` — com o `builtAt` já injetado via `-ldflags`): desempate
  necessário porque as RCs deste projeto usam tag flutuante
  (`vX.Y.Z-rc`, recortada com `git push --force` a cada
  `release-candidate.sh`, ver `docs/workflow.md`), então a mesma string de
  versão pode corresponder a builds diferentes ao longo do tempo e semver
  puro nunca detecta uma republicação. `CurrentBuiltAt` vazio ou não
  parseável só desativa o desempate (equivalente a comparar só semver),
  nunca gera erro.
- `manifest.go` — `Manifest`/`Asset`/`BuildManifest`: o formato do
  `version.json` (versão latest, notas, imagem Docker, checksums por
  arquitetura). Anexado como asset em TODA release publicada (estável ou
  pré-release), não só na apontada por `/latest/download/`.
- `notes.go` — `NotesFetcher`/`NewNotesFetcher`: busca o changelog da
  release de uma versão EXATA via API REST do GitHub
  (`GET /repos/.../releases/tags/{versão}` — diferente do `Checker`, que
  resolve "a mais recente publicada", não uma versão específica), cacheia
  em memória sem expiração (a versão instalada não muda sem restart).

## Decisões e invariantes
- `DefaultDownloadBase` (`/releases/latest/download/`) continua existindo
  como constante pública, mas não é mais usada internamente por nenhum
  fallback — desde que o updater passou a receber a base de download via
  `Checker.DownloadBase()` (resolvida a cada `Check`), não há mais um
  atalho fixo pra "estável" no caminho de aplicação. `DownloadBase()`
  retorna `""` antes do 1º `Check` bem-sucedido.

## Ver também
- [internal/server](../server/README.md) — `NotifyUpdateAvailable` (via `internal/notifications`), `GET /api/about` e `GET /api/updates` consomem este pacote.
- [internal/updater](../updater/README.md) — consome o `Manifest` e o `DownloadBase()` do checker pra baixar e aplicar a atualização.
