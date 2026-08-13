package core

import "context"

// Snapshot captura 1 frame JPEG de uma URL de câmera, qualquer que seja o
// capture_type — só protocolos RTSP precisam da flag de transporte
// (NeedsRTSPTransport); HLS e MJPEG são servidos sobre HTTP puro, onde essa
// flag é erro fatal do ffmpeg, não um no-op.
func Snapshot(ctx context.Context, url, captureType string, executor Executor) ([]byte, error) {
	var args []string
	if NeedsRTSPTransport(captureType) {
		args = append(args, "-rtsp_transport", "tcp")
	}
	args = append(args, InputArgs(url)...)
	args = append(args, "-frames:v", "1", "-f", "image2", "-vcodec", "mjpeg", "-")
	return executor.Execute(ctx, "ffmpeg", args...)
}
