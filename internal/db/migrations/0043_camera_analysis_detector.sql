ALTER TABLE camera_analysis_config ADD COLUMN detector_id INTEGER REFERENCES object_detectors(id) ON DELETE SET NULL;
ALTER TABLE camera_analysis_config ADD COLUMN confidence_threshold REAL;
