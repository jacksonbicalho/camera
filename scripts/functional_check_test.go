package scripts

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// markCheckShCriteria sources functional-check.sh as a library
// (FUNCTIONAL_CHECK_SH_LIB short-circuits check.sh/story resolution) and
// calls mark_check_sh_criteria on a fixture story file, returning its
// contents after the call.
func markCheckShCriteria(t *testing.T, storyContents string) string {
	t.Helper()

	story := filepath.Join(t.TempDir(), "story.md")
	if err := os.WriteFile(story, []byte(storyContents), 0o644); err != nil {
		t.Fatalf("escrever story: %v", err)
	}

	out, err := bash(t, "FUNCTIONAL_CHECK_SH_LIB=1 source ./functional-check.sh && mark_check_sh_criteria "+story)
	if err != nil {
		t.Fatalf("mark_check_sh_criteria falhou: %v\nsaída:\n%s", err, out)
	}

	got, err := os.ReadFile(story)
	if err != nil {
		t.Fatalf("ler story: %v", err)
	}
	return string(got)
}

func TestMarkCheckShCriteriaMarksNonCA1Criterion(t *testing.T) {
	got := markCheckShCriteria(t, strings.Join([]string{
		"## Critérios de Aceitação",
		"- [x] CA1: Backend e frontend verdes (auto: scripts/check.sh)",
		"- [] CA2: HistoryTimeline.test.tsx reestruturado (auto: scripts/check.sh)",
	}, "\n"))

	if !strings.Contains(got, "- [x] CA2: HistoryTimeline.test.tsx reestruturado (auto: scripts/check.sh)") {
		t.Errorf("CA2 não foi marcado; story:\n%s", got)
	}
}

func TestMarkCheckShCriteriaLeavesFunctionalScriptCriteriaAlone(t *testing.T) {
	got := markCheckShCriteria(t, strings.Join([]string{
		"## Critérios de Aceitação",
		"- [x] CA1: Backend e frontend verdes (auto: scripts/check.sh)",
		"- [] CA3: cenário dedicado (auto: tests/functional/ca3_exemplo.sh)",
	}, "\n"))

	if !strings.Contains(got, "- [] CA3: cenário dedicado (auto: tests/functional/ca3_exemplo.sh)") {
		t.Errorf("CA3 (cenário dedicado) não deveria ter sido tocado; story:\n%s", got)
	}
}

func TestMarkCheckShCriteriaIsIdempotent(t *testing.T) {
	story := strings.Join([]string{
		"## Critérios de Aceitação",
		"- [x] CA1: Backend e frontend verdes (auto: scripts/check.sh)",
		"- [] CA2: eventCategory.test.ts reestruturado (auto: scripts/check.sh)",
	}, "\n")

	once := markCheckShCriteria(t, story)
	if !strings.Contains(once, "- [x] CA2: eventCategory.test.ts reestruturado (auto: scripts/check.sh)") {
		t.Fatalf("CA2 não foi marcado na 1ª chamada; story:\n%s", once)
	}

	// Roda de novo sobre o resultado já marcado — não deve duplicar `[x]` nem quebrar a linha.
	twice := markCheckShCriteria(t, once)
	if twice != once {
		t.Errorf("2ª chamada alterou a story já marcada:\nantes:\n%s\ndepois:\n%s", once, twice)
	}
}
