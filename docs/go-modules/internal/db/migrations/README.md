# internal/db/migrations

Os arquivos `.sql` de migration, embutidos via `go:embed` e aplicados por
`applyMigrations` (`internal/db/db.go`) no `Open`. Formato de nome
`NNNN_descricao.sql`, ordenados alfabeticamente — a **versão aplicada é
posicional** (`i+1` na lista ordenada, não o número extraído do nome), então
a numeração zero-padded existe só pra manter a ordem alfabética = ordem
cronológica; nunca inserir uma migration "no meio" da sequência.

Cada migration roda **uma única vez** (rastreado em `schema_migrations`,
tabela `version INTEGER PRIMARY KEY`) — `splitSQL` divide o script em `;` pra
executar statement por statement.

**Regra crítica: nunca usar `;` dentro de um comentário SQL.** `splitSQL` é
ingênuo (só `strings.Split` por `;`), então um `;` dentro de um `--
comentário` corta o statement no meio e quebra todas as migrations
seguintes — já causou incidente real.

50 migrations até agora (`0001_initial.sql` … `0050_camera_live_enabled.sql`).

## Ver também
- [internal/db](../README.md) — `Open`/`applyMigrations`, as tabelas resultantes.
