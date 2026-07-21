-- Override opcional de retencao do historico de estado por classificador.
-- NULL = herda o default global (storage.state_history_minutes).
-- Um valor explicito (incluindo 0 = manter para sempre) sobrescreve so esse classificador.
ALTER TABLE camera_state_classifiers ADD COLUMN history_retention_minutes INTEGER;
