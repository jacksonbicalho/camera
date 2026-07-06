-- user_permissions e user_settings sao estruturalmente identicas
-- (user_id, key, value) - funde tudo em user_settings, uma unica
-- tabela KV generica por usuario
INSERT OR IGNORE INTO user_settings (user_id, key, value)
SELECT user_id, key, value FROM user_permissions;

DROP TABLE user_permissions;
