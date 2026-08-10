-- S3 vira uma extensão (internal/extensions/s3), tratada como singleton
-- (0 ou 1 linha, aplicado em Go em InsertRetentionExtension) em vez de
-- múltiplos destinos nomeados. Tabela e coluna renomeadas para refletir o
-- domínio novo. SQLite (modernc.org/sqlite, >=3.25) atualiza sozinho a
-- definição da FK ao renomear a coluna referenciada.
ALTER TABLE drives RENAME TO retention_extensions;
ALTER TABLE retention_config RENAME COLUMN drive_id TO retention_extension_id;
