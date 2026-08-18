package webrtc

import "testing"

func TestShouldPublish(t *testing.T) {
	cases := []struct {
		codec     string
		transport string
		want      bool
	}{
		{"h264", "auto", true},
		{"h264", "webrtc", true},
		{"h264", "", true},   // empty transport defaults to publishing
		{"h264", "hls", false}, // forced HLS: no publisher
		{"hevc", "auto", false},
		{"h265", "webrtc", false},
		{"", "auto", false},
	}
	for _, c := range cases {
		if got := ShouldPublish(c.codec, c.transport, "rtsp", true); got != c.want {
			t.Errorf("ShouldPublish(%q, %q) = %v, want %v", c.codec, c.transport, got, c.want)
		}
	}
}

func TestShouldRunHLS(t *testing.T) {
	cases := []struct {
		codec     string
		transport string
		want      bool
	}{
		{"h264", "auto", true},    // fallback kept
		{"h264", "hls", true},     // HLS-only
		{"h264", "webrtc", false}, // WebRTC forced and viable → no HLS, no .ts
		{"hevc", "webrtc", true},  // WebRTC can't play H.265 → HLS stays
		{"", "webrtc", true},      // codec unknown → keep HLS (safe)
		{"hevc", "auto", true},
		{"h264", "", true}, // empty transport → keep HLS
	}
	for _, c := range cases {
		if got := ShouldRunHLS(c.codec, c.transport, "rtsp", true); got != c.want {
			t.Errorf("ShouldRunHLS(%q, %q) = %v, want %v", c.codec, c.transport, got, c.want)
		}
	}
}

// --- capture_type + live_enabled (história feat/hls-capture-backend-completo) ---

func TestShouldPublishAndShouldRunHLS_CaptureTypeAndLiveEnabled(t *testing.T) {
	t.Run("CA5: capture_type=hls nunca publica WebRTC, mesmo com h264", func(t *testing.T) {
		if got := ShouldPublish("h264", "auto", "hls", true); got != false {
			t.Errorf("ShouldPublish(h264, auto, hls, true) = %v, want false", got)
		}
		if got := ShouldPublish("h264", "webrtc", "hls", true); got != false {
			t.Errorf("ShouldPublish(h264, webrtc, hls, true) = %v, want false", got)
		}
	})

	t.Run("CA5: capture_type=hls sempre roda o pipeline HLS quando live_enabled=true", func(t *testing.T) {
		if got := ShouldRunHLS("h264", "webrtc", "hls", true); got != true {
			t.Errorf("ShouldRunHLS(h264, webrtc, hls, true) = %v, want true", got)
		}
	})

	t.Run("CA5: capture_type=rtsp preserva o comportamento atual quando live_enabled=true", func(t *testing.T) {
		if got := ShouldPublish("h264", "auto", "rtsp", true); got != true {
			t.Errorf("ShouldPublish(h264, auto, rtsp, true) = %v, want true", got)
		}
		if got := ShouldRunHLS("h264", "webrtc", "rtsp", true); got != false {
			t.Errorf("ShouldRunHLS(h264, webrtc, rtsp, true) = %v, want false", got)
		}
	})

	t.Run("CA5: live_enabled=false desliga tudo, independente de codec/transport/capture_type", func(t *testing.T) {
		if got := ShouldPublish("h264", "auto", "rtsp", false); got != false {
			t.Errorf("ShouldPublish(h264, auto, rtsp, false) = %v, want false", got)
		}
		if got := ShouldRunHLS("h264", "auto", "rtsp", false); got != false {
			t.Errorf("ShouldRunHLS(h264, auto, rtsp, false) = %v, want false", got)
		}
		if got := ShouldRunHLS("h264", "webrtc", "hls", false); got != false {
			t.Errorf("ShouldRunHLS(h264, webrtc, hls, false) = %v, want false", got)
		}
	})
}

// --- MJPEG removido (história chore/remover-mjpeg-backend) ---

func TestShouldPublishAndShouldRunHLS_MJPEGNaoMaisEspecial(t *testing.T) {
	t.Run("CA5: capture_type=mjpeg não bloqueia mais WebRTC (tratado como capture_type genérico, não mais como hls)", func(t *testing.T) {
		if got := ShouldPublish("h264", "auto", "mjpeg", true); got != true {
			t.Errorf("ShouldPublish(h264, auto, mjpeg, true) = %v, want true (mjpeg não é mais especial)", got)
		}
	})

	t.Run("CA5: capture_type=mjpeg não força mais o pipeline HLS (tratado como capture_type genérico)", func(t *testing.T) {
		if got := ShouldRunHLS("h264", "webrtc", "mjpeg", true); got != false {
			t.Errorf("ShouldRunHLS(h264, webrtc, mjpeg, true) = %v, want false (mjpeg não é mais especial)", got)
		}
	})
}
