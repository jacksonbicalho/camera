-- KV generico de configuracoes de usuario (separado de user_permissions,
-- que fica so para flags de acesso/notificacao por classificador)
CREATE TABLE user_settings (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key     TEXT    NOT NULL,
    value   TEXT    NOT NULL,
    PRIMARY KEY (user_id, key)
);

INSERT INTO user_settings (user_id, key, value)
SELECT id, 'theme', theme FROM users;

ALTER TABLE users DROP COLUMN theme;
