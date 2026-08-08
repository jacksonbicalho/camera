-- Per-camera live transmission toggle, independent of live_transport (which
-- only chooses BETWEEN auto/webrtc/hls, always one of the three active).
-- live_enabled=0 fully disables live delivery (no HLS pipeline, no WebRTC
-- publisher) for that camera, regardless of live_transport. Default 1
-- preserves the current behavior (live delivery always on).
ALTER TABLE cameras ADD COLUMN live_enabled INTEGER NOT NULL DEFAULT 1;
