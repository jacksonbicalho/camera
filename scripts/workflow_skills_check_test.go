package scripts

import (
	"os"
	"strings"
	"testing"
)

// TestWorkflowInstructsCheckingSkills é o guard da história
// feat/tickets-github-issues (T5): /analyze e /story devem checar
// .claude/skills/ por skills aplicáveis à demanda (ex.: mudanças de
// frontend → composition-patterns/react-best-practices/
// web-design-guidelines) e invocá-las via Skill tool durante a
// investigação/decomposição, em vez de depender do driver lembrar disso
// por conta própria. docs/workflow.md é a fonte canônica; os slash
// commands (.claude/commands/analyze.md e story.md) são o que
// efetivamente dirige o comportamento a cada invocação — os dois
// precisam refletir a instrução.
func TestWorkflowInstructsCheckingSkills(t *testing.T) {
	files := map[string]string{
		"docs/workflow.md":            "../docs/workflow.md",
		".claude/commands/analyze.md": "../.claude/commands/analyze.md",
		".claude/commands/story.md":   "../.claude/commands/story.md",
	}

	for label, path := range files {
		label, path := label, path
		t.Run("CA9: "+label+" instrui checar .claude/skills/", func(t *testing.T) {
			content, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("ler %s: %v", path, err)
			}
			if !strings.Contains(string(content), ".claude/skills") {
				t.Errorf("%s não menciona .claude/skills/ — instrua checar skills aplicáveis à demanda", path)
			}
		})
	}
}
