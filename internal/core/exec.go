package core

import (
	"context"
	"os/exec"
)

// Executor runs an external command and returns its captured stdout.
type Executor interface {
	Execute(ctx context.Context, name string, args ...string) ([]byte, error)
}

// OSExecutor executa via os/exec de verdade.
type OSExecutor struct{}

func (OSExecutor) Execute(ctx context.Context, name string, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, name, args...).Output()
}
