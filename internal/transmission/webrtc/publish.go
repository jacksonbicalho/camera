package webrtc

// ShouldPublish reports whether a WebRTC publisher should run for a camera with
// the given video codec, live transport preference, capture type and live
// delivery toggle. WebRTC in browsers only plays H.264, and the "hls" preference
// forces HLS by not publishing at all (the client then gets a 409 and falls
// back). "auto"/"webrtc"/"" all publish when the codec is H.264. A camera whose
// capture source is HLS never gets a publisher — the WebRTC pipeline talks RTSP
// directly (gortsplib), structurally incompatible with it — and
// liveEnabled=false disables all live delivery regardless of anything else.
func ShouldPublish(videoCodec, transport, captureType string, liveEnabled bool) bool {
	if !liveEnabled || captureType == "hls" {
		return false
	}
	return videoCodec == "h264" && transport != "hls"
}

// ShouldRunHLS reports whether the HLS pipeline should run for a camera with the
// given video codec, live transport preference, capture type and live delivery
// toggle. HLS is kept unless WebRTC is the forced transport AND actually viable
// (H.264) — a non-H.264 "webrtc" camera still needs HLS because browsers can't
// play it over WebRTC, and "auto"/"hls" always keep HLS (fallback / HLS-only).
// This is what lets a "webrtc" camera stop writing .ts segments entirely. A
// camera whose capture source is HLS always keeps the HLS pipeline running —
// it's the only delivery mechanism that can work for it (WebRTC never can, see
// ShouldPublish) — unless liveEnabled=false disables all live delivery.
func ShouldRunHLS(videoCodec, transport, captureType string, liveEnabled bool) bool {
	if !liveEnabled {
		return false
	}
	if captureType == "hls" {
		return true
	}
	return !(transport == "webrtc" && videoCodec == "h264")
}
