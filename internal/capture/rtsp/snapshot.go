package rtsp

import (
	"context"

	"camera/internal/core"
)

// Snapshot captura 1 frame JPEG do stream RTSP da câmera.
func Snapshot(ctx context.Context, url string, executor core.Executor) ([]byte, error) {
	args := append(ConnectArgs(url), "-frames:v", "1", "-f", "image2", "-vcodec", "mjpeg", "-")
	return executor.Execute(ctx, "ffmpeg", args...)
}
