DROP TABLE detections;
DROP TABLE camera_analysis_config;
DROP TABLE annotations;
DROP TABLE object_detectors;
DROP TABLE object_detector_config;
DROP TABLE trainers;
DROP TABLE trainer_config;

ALTER TABLE recordings DROP COLUMN analysis_skipped;
