DELETE FROM user_settings
WHERE key LIKE 'camera:%'
  AND substr(key, 8) NOT IN (SELECT id FROM cameras);
