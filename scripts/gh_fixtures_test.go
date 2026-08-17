package scripts

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// writeStoryFixture cria um arquivo de story temporário com o conteúdo dado,
// uma linha por elemento — usado pelos testes de scripts/lib/story.sh e dos
// scripts que leem a tabela ## Tickets.
func writeStoryFixture(t *testing.T, lines ...string) string {
	t.Helper()
	story := filepath.Join(t.TempDir(), "story.md")
	if err := os.WriteFile(story, []byte(strings.Join(lines, "\n")+"\n"), 0o644); err != nil {
		t.Fatalf("escrever story: %v", err)
	}
	return story
}

// bashWithEnv roda um script bash com variáveis de ambiente extras (ex.:
// PATH apontando pra um `gh` fake, GH_LOG apontando pro log de chamadas) —
// generalização do bash() de check_test.go pros testes que precisam de um
// `gh` fake no PATH.
func bashWithEnv(t *testing.T, script string, extraEnv ...string) (string, error) {
	t.Helper()
	cmd := exec.Command("bash", "-c", script)
	cmd.Env = append(os.Environ(), extraEnv...)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// newFakeGh cria um binário `gh` fake que registra toda chamada (args
// completos) em GH_LOG (uma linha por chamada, lida via variável de
// ambiente — cada teste passa a sua própria pra isolar os testes entre si)
// e, pra `gh issue create`, devolve uma URL de issue fake com número
// incremental — o bastante pros scripts que extraem o número da issue da
// saída de `gh issue create` (mesmo formato da saída real do gh CLI).
func newFakeGh(t *testing.T) (binDir, logPath string) {
	t.Helper()
	binDir = t.TempDir()
	logPath = filepath.Join(t.TempDir(), "gh.log")
	script := `#!/bin/sh
count=0
if [ -f "$GH_LOG" ]; then count=$(grep -c '^issue create' "$GH_LOG"); fi
echo "$@" >> "$GH_LOG"
if [ "$1" = "issue" ] && [ "$2" = "create" ]; then
  n=$((count + 999))
  echo "https://github.com/example/os-camera/issues/$n"
fi
`
	if err := os.WriteFile(filepath.Join(binDir, "gh"), []byte(script), 0o755); err != nil {
		t.Fatalf("escrever gh fake: %v", err)
	}
	return binDir, logPath
}
