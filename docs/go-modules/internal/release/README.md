# internal/release

Checagem de atualização disponível e busca de changelog — puramente HTTP
contra o GitHub Releases, sem git/gh no processo.

## Arquivos principais
- `checker.go` — `Checker`/`NewChecker(url, current, client)`: busca
  periodicamente (`Run(ctx, interval)`) o `version.json` estático servido em
  `/releases/latest/download/` (nunca resolve pré-release — por isso uma RC
  publicada nunca aparece aqui, ver `docs/workflow.md`) e cacheia o
  `Manifest` + um `Status` (snapshot seguro pra serializar, incluindo
  `UpdateAvailable`). `OnCheck`, se definido, roda ao fim de cada `Check`
  (é aqui que `main.go` liga `Server.NotifyUpdateAvailable`).
- `manifest.go` — `Manifest`/`Asset`/`BuildManifest`: o formato do
  `version.json` (versão latest, notas, imagem Docker, checksums por
  arquitetura).
- `notes.go` — `NotesFetcher`/`NewNotesFetcher`: busca o changelog da
  release de uma versão EXATA via API REST do GitHub
  (`GET /repos/.../releases/tags/{versão}` — diferente do `Checker`, que só
  lê o `version.json` estático), cacheia em memória sem expiração (a versão
  instalada não muda sem restart).

## Ver também
- [internal/server](../server/README.md) — `NotifyUpdateAvailable` (via `internal/notifications`) e `GET /api/about` consomem este pacote.
- [internal/updater](../updater/README.md) — consome o `Manifest` pra baixar e aplicar a atualização.
