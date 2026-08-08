package rtsp

import (
	"context"
	"os/exec"
)

// Executor runs an external command and returns its captured stdout — mesma
// forma de internal/ffprobe.Executor, definida de novo aqui (lado do
// consumidor, convenção do projeto) em vez de importar a de ffprobe pra uma
// interface de 1 método.
type Executor interface {
	Execute(ctx context.Context, name string, args ...string) ([]byte, error)
}

// OSExecutor executa via os/exec de verdade.
type OSExecutor struct{}

func (OSExecutor) Execute(ctx context.Context, name string, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, name, args...).Output()
}

// Snapshot captura 1 frame JPEG do stream RTSP da câmera.
func Snapshot(ctx context.Context, url string, executor Executor) ([]byte, error) {
	args := append(ConnectArgs(url), "-frames:v", "1", "-f", "image2", "-vcodec", "mjpeg", "-")
	return executor.Execute(ctx, "ffmpeg", args...)
}
