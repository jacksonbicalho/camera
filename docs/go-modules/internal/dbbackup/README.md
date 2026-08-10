# internal/dbbackup

Snapshot/restore do banco SQLite (arquivo único) — rede de segurança pra
reverter o estado quando uma atualização (que pode aplicar migrations
forward-only, sem down-migration) dá errado.

## Arquivos principais
- `backup.go` — `Snapshot(dbPath, destDir, label)` (nome derivado de `label` +
  timestamp, via `sanitize` pra um nome de arquivo seguro; executa
  `VACUUM INTO <dest>` — não uma cópia bruta de arquivo — o que produz um
  snapshot consistente do estado *committed* mesmo com o banco aberto/em uso),
  `Prune(destDir, keep)` (mantém só os `keep` snapshots mais recentes, ordena
  por nome — o timestamp no nome já ordena cronologicamente) e
  `Restore(snapshotPath, dbPath)` (aí sim copia o arquivo de volta por cima
  do banco atual, e remove os sidecars `-wal`/`-shm` antigos pra não deixar
  um WAL órfão referenciando o banco anterior).

## Ver também
- [internal/db](../db/README.md) — o arquivo SQLite que este pacote copia/restaura, sem conhecer seu schema.
- [internal/updater](../updater/README.md) — consumidor real (backup antes de aplicar uma atualização).
