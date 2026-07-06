INSERT INTO user_settings (user_id, key, value)
SELECT user_id, 'camera:' || camera_id, '1' FROM user_cameras;

DROP TABLE user_cameras;
