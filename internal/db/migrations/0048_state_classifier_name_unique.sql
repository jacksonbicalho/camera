-- Nome de classificador de estado passa a ser único por câmera: a categoria
-- composta (estados:<slug-do-nome>:<estado>) depende de nome ser um
-- identificador confiável dentro da mesma câmera.
CREATE UNIQUE INDEX IF NOT EXISTS idx_state_classifiers_camera_name
    ON camera_state_classifiers(camera_id, name);
