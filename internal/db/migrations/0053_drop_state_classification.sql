DROP TABLE camera_state_history;
DROP TABLE camera_state_classes;
DROP TABLE camera_state_classifiers;

DELETE FROM user_settings
WHERE key LIKE 'state_notify:%' OR key LIKE 'state_footer:%';
