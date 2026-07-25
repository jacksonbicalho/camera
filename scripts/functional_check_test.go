package scripts

import (
	"os"
	"path/filepath"
	"regexp"
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

func TestMarkCheckShCriteriaLeavesOtherCommandCriteriaAlone(t *testing.T) {
	got := markCheckShCriteria(t, strings.Join([]string{
		"## Critérios de Aceitação",
		"- [x] CA1: Backend e frontend verdes (auto: scripts/check.sh)",
		"- [] CA3: PDF report (auto: E2E_PDF_REPORT=on bash scripts/e2e-pdf-report-check.sh)",
	}, "\n"))

	if !strings.Contains(got, "- [] CA3: PDF report (auto: E2E_PDF_REPORT=on bash scripts/e2e-pdf-report-check.sh)") {
		t.Errorf("CA3 (comando diferente de scripts/check.sh) não deveria ter sido tocado; story:\n%s", got)
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

// markCommandCriteria sources functional-check.sh como lib e chama
// mark_command_criteria(story, command) — a generalização de
// mark_check_sh_criteria pra QUALQUER comando anotado em `(auto: ...)`, não
// só `scripts/check.sh`.
func markCommandCriteria(t *testing.T, storyContents, command string) string {
	t.Helper()

	story := filepath.Join(t.TempDir(), "story.md")
	if err := os.WriteFile(story, []byte(storyContents), 0o644); err != nil {
		t.Fatalf("escrever story: %v", err)
	}

	out, err := bash(t, "FUNCTIONAL_CHECK_SH_LIB=1 source ./functional-check.sh && mark_command_criteria "+story+" '"+command+"'")
	if err != nil {
		t.Fatalf("mark_command_criteria falhou: %v\nsaída:\n%s", err, out)
	}

	got, err := os.ReadFile(story)
	if err != nil {
		t.Fatalf("ler story: %v", err)
	}
	return string(got)
}

func TestMarkCommandCriteriaMarksGenericCommand(t *testing.T) {
	got := markCommandCriteria(t, strings.Join([]string{
		"## Critérios de Aceitação",
		"- [x] CA1: Backend e frontend verdes (auto: scripts/check.sh)",
		"- [] CA3: PDF report tem conteúdo detalhado (auto: E2E_PDF_REPORT=on bash scripts/e2e-pdf-report-check.sh)",
	}, "\n"), "E2E_PDF_REPORT=on bash scripts/e2e-pdf-report-check.sh")

	if !strings.Contains(got, "- [x] CA3: PDF report tem conteúdo detalhado (auto: E2E_PDF_REPORT=on bash scripts/e2e-pdf-report-check.sh)") {
		t.Errorf("CA3 (comando genérico com env var) não foi marcado; story:\n%s", got)
	}
}

func TestMarkCommandCriteriaLeavesOtherCommandsAlone(t *testing.T) {
	got := markCommandCriteria(t, strings.Join([]string{
		"## Critérios de Aceitação",
		"- [x] CA1: Backend e frontend verdes (auto: scripts/check.sh)",
		"- [] CA4: harness e2e sobe (auto: bash scripts/e2e.sh)",
	}, "\n"), "E2E_PDF_REPORT=on bash scripts/e2e-pdf-report-check.sh")

	if !strings.Contains(got, "- [] CA4: harness e2e sobe (auto: bash scripts/e2e.sh)") {
		t.Errorf("CA4 (comando diferente do que foi marcado) não deveria ter sido tocado; story:\n%s", got)
	}
}

func TestExtractAutoCommandsParsesMultipleDistinctCommands(t *testing.T) {
	story := filepath.Join(t.TempDir(), "story.md")
	contents := strings.Join([]string{
		"## Critérios de Aceitação",
		"- [x] CA1: Backend e frontend verdes (auto: scripts/check.sh)",
		"- [] CA2: retenção nomeada (auto: scripts/check.sh)",
		"- [] CA3: PDF report (auto: E2E_PDF_REPORT=on bash scripts/e2e-pdf-report-check.sh)",
	}, "\n")
	if err := os.WriteFile(story, []byte(contents), 0o644); err != nil {
		t.Fatalf("escrever story: %v", err)
	}

	out, err := bash(t, "FUNCTIONAL_CHECK_SH_LIB=1 source ./functional-check.sh && extract_auto_commands "+story)
	if err != nil {
		t.Fatalf("extract_auto_commands falhou: %v\nsaída:\n%s", err, out)
	}

	for _, want := range []string{
		"CA1|scripts/check.sh",
		"CA2|scripts/check.sh",
		"CA3|E2E_PDF_REPORT=on bash scripts/e2e-pdf-report-check.sh",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("extract_auto_commands não encontrou %q; saída:\n%s", want, out)
		}
	}
}

// TestNoDedicatedFunctionalScripts é o guard real do CA (tests/functional/
// deixou de existir) da história refactor/eliminar-scripts-sh-ca: sem essa
// trava, nada impede alguém de recriar o diretório/mecanismo no futuro e o
// CA correspondente (anotado `auto: scripts/check.sh`) ficaria marcado `[x]`
// só por coincidência (a suíte passa mesmo se o diretório reaparecer).
func TestNoDedicatedFunctionalScripts(t *testing.T) {
	if _, err := os.Stat("../tests/functional"); !os.IsNotExist(err) {
		t.Errorf("tests/functional/ ainda existe (err=%v) — mecanismo de script dedicado por CA foi eliminado", err)
	}
}

// TestCanonicalDocsDoNotReferenceDedicatedFunctionalScripts é o guard real do
// CA (docs canônicas) da história refactor/eliminar-scripts-sh-ca: garante
// que ninguém reintroduza a instrução "crie um script tests/functional/caNN"
// nos 3 arquivos que documentam o mecanismo. Não basta a ausência da
// substring "tests/functional" pura — CLAUDE.md/docs/workflow.md mencionam o
// caminho ao explicar que o mecanismo foi eliminado (contexto histórico
// legítimo); o sinal preciso é a anotação de exemplo `auto: tests/functional/
// ...`, que só aparecia como instrução acionável no formato antigo de CA.
var canonicalDocs = []string{
	"../CLAUDE.md",
	"../docs/workflow.md",
	"../.claude/commands/story.md",
}

func TestCanonicalDocsDoNotReferenceDedicatedFunctionalScripts(t *testing.T) {
	pattern := regexp.MustCompile(`auto:\s*tests/functional`)
	for _, path := range canonicalDocs {
		content, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("ler %s: %v", path, err)
		}
		if pattern.Match(content) {
			t.Errorf("%s ainda instrui `(auto: tests/functional/...)` — mecanismo de script dedicado por CA foi eliminado", path)
		}
	}
}

// operationalDocs são resumos/diretivas curtas (hook injetado a cada sessão,
// slash command /fluxo) — diferente de CLAUDE.md/docs/workflow.md, não têm
// motivo legítimo pra mencionar tests/functional/ nem em contexto histórico:
// checagem mais estrita, substring pura já é suficiente.
var operationalDocs = []string{
	"../scripts/hooks/session-start.sh",
	"../.claude/commands/fluxo.md",
}

func TestOperationalDocsDoNotReferenceDedicatedFunctionalScripts(t *testing.T) {
	for _, path := range operationalDocs {
		content, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("ler %s: %v", path, err)
		}
		if strings.Contains(string(content), "tests/functional") {
			t.Errorf("%s ainda menciona tests/functional/ — mecanismo de script dedicado por CA foi eliminado", path)
		}
	}
}
