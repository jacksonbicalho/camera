INSERT INTO user_settings (user_id, key, value)
SELECT user_id, 'notification:' || id,
       json_object('type', type, 'title', title, 'message', message, 'link', link,
                   'created_at', created_at, 'read_at', read_at)
FROM user_notifications;

INSERT INTO user_settings (user_id, key, value)
SELECT user_id, 'notification_seq', CAST(MAX(id) AS TEXT)
FROM user_notifications
GROUP BY user_id;

DROP TABLE user_notifications;
