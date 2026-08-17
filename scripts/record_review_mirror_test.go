package scripts

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestRecordReviewMirrorsVerdictToIssue(t *testing.T) {
	repoRoot, err := filepath.Abs("..")
	if err != nil {
		t.Fatalf("resolver raiz do repo: %v", err)
	}

	run := func(t *testing.T, story, ticket, fakeBin, ghLog string) (string, error) {
		t.Helper()
		cmd := exec.Command("bash", filepath.Join(repoRoot, "scripts", "record-review.sh"), ticket, "1", story)
		cmd.Env = append(os.Environ(),
			"PATH="+fakeBin+":"+os.Getenv("PATH"),
			"GH_LOG="+ghLog,
		)
		cmd.Stdin = strings.NewReader("VERDICT: APPROVED\nTICKET: " + ticket + "\n\n## Issues\n- nenhum\n")
		out, err := cmd.CombinedOutput()
		return string(out), err
	}

	t.Run("CA6: espelha o veredito na Issue quando o ticket tem Issue registrada", func(t *testing.T) {
		fakeBin, ghLog := newFakeGh(t)
		story := writeStoryFixture(t,
			"## Tickets",
			"| # | Descrição | Depende de | Issue | Status |",
			"|---|-----------|------------|-------|--------|",
			"| T1 | Primeiro ticket | — | #77 | [] |",
			"",
			"## Code Review",
		)

		out, err := run(t, story, "T1", fakeBin, ghLog)
		if err != nil {
			t.Fatalf("record-review.sh falhou: %v\nsaída:\n%s", err, out)
		}

		log, _ := os.ReadFile(ghLog)
		if !strings.Contains(string(log), "issue comment 77") {
			t.Errorf("esperava chamada 'gh issue comment 77 ...'; log de chamadas gh:\n%s", string(log))
		}
	})

	t.Run("CA6: nao quebra quando o ticket nao tem Issue registrada", func(t *testing.T) {
		fakeBin, ghLog := newFakeGh(t)
		story := writeStoryFixture(t,
			"## Tickets",
			"| # | Descrição | Depende de | Issue | Status |",
			"|---|-----------|------------|-------|--------|",
			"| T2 | Segundo ticket | — | — | [] |",
			"",
			"## Code Review",
		)

		out, err := run(t, story, "T2", fakeBin, ghLog)
		if err != nil {
			t.Fatalf("record-review.sh falhou: %v\nsaída:\n%s", err, out)
		}

		got, _ := os.ReadFile(story)
		if !strings.Contains(string(got), "T2: APPROVED") {
			t.Errorf("registro normal do veredito não aconteceu; story:\n%s", string(got))
		}

		log, _ := os.ReadFile(ghLog)
		if strings.Contains(string(log), "issue comment") {
			t.Errorf("não deveria ter chamado 'gh issue comment' sem Issue registrada; log:\n%s", string(log))
		}
	})
}
