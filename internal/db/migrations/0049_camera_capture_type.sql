-- Per-camera capture protocol: rtsp (default, only protocol supported until
-- now) or hls (camera's source is an HLS playlist served over HTTP instead
-- of RTSP). Default rtsp preserves the current behavior for every existing
-- camera. See internal/capture/rtsp and internal/capture/hls.
ALTER TABLE cameras ADD COLUMN capture_type TEXT NOT NULL DEFAULT 'rtsp';
