CREATE TABLE IF NOT EXISTS object_detectors (
    id         INTEGER  PRIMARY KEY AUTOINCREMENT,
    name       TEXT     NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS object_detector_config (
    detector_id INTEGER NOT NULL REFERENCES object_detectors(id) ON DELETE CASCADE,
    key         TEXT    NOT NULL,
    value       TEXT    NOT NULL,
    PRIMARY KEY (detector_id, key)
);
