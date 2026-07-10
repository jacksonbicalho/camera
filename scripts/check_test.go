// Package scripts holds tests for the workflow shell scripts. It has no
// non-test files: the code under test is bash, sourced through `go test`, which
// the CI already runs — no extra tooling (bats, shellcheck) needed.
package scripts

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// bash runs a snippet from the scripts/ directory, returning stdout+stderr
// together — the failure summary is what the user sees, whichever stream it
// lands on.
func bash(t *testing.T, script string) (string, error) {
	t.Helper()
	cmd := exec.Command("bash", "-c", script)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// failSummary sources check.sh as a library (CHECK_SH_LIB short-circuits the
// build/test run) and calls fail_summary on a log file, returning what a user
// would see on screen.
func failSummary(t *testing.T, logContents string) string {
	t.Helper()

	log := filepath.Join(t.TempDir(), "check-go.log")
	if err := os.WriteFile(log, []byte(logContents), 0o644); err != nil {
		t.Fatalf("escrever log: %v", err)
	}

	out, err := bash(t, "CHECK_SH_LIB=1 source ./check.sh && fail_summary "+log)
	if err != nil {
		t.Fatalf("fail_summary falhou: %v\nsaída:\n%s", err, out)
	}
	return out
}

func TestFailSummaryShowsFailingTest(t *testing.T) {
	out := failSummary(t, strings.Join([]string{
		"ok  	camera/internal/db	0.02s",
		"--- FAIL: TestLogin (0.00s)",
		"    server_test.go:40: esperava 200, veio 401",
		"FAIL	camera/internal/server	3.36s",
	}, "\n"))

	// The pattern starts with "--", which grep parses as a long option unless
	// the argument list is terminated with "--".
	if strings.Contains(out, "unrecognized option") {
		t.Errorf("grep tratou o padrão como opção; saída:\n%s", out)
	}
	if !strings.Contains(out, "--- FAIL: TestLogin") {
		t.Errorf("resumo não mostra o teste que falhou; saída:\n%s", out)
	}
}

// A compile failure prints no "--- FAIL" line, so a summary that only greps
// would come out empty — exactly when the developer needs the output most.
func TestFailSummaryFallsBackOnCompileError(t *testing.T) {
	out := failSummary(t, strings.Join([]string{
		"# camera/internal/server [camera/internal/server.test]",
		"internal/server/openapi_test.go:75:26: undefined: route",
		"FAIL	camera/internal/server [build failed]",
	}, "\n"))

	if !strings.Contains(out, "undefined: route") {
		t.Errorf("resumo não mostra o erro de compilação; saída:\n%s", out)
	}
}

func TestFailSummaryPointsAtFullLog(t *testing.T) {
	out := failSummary(t, "--- FAIL: TestFoo (0.00s)")

	if !strings.Contains(out, "check-go.log") {
		t.Errorf("resumo não aponta o log completo; saída:\n%s", out)
	}
}
