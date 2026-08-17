package scripts

import (
	"os"
	"strings"
	"testing"
)

func TestCloseTicketIssues(t *testing.T) {
	t.Run("CA7: fecha a Issue de cada ticket que tem Issue registrada", func(t *testing.T) {
		fakeBin, ghLog := newFakeGh(t)
		story := writeStoryFixture(t,
			"## Tickets",
			"| # | Descrição | Depende de | Issue | Status |",
			"|---|-----------|------------|-------|--------|",
			"| T1 | Primeiro ticket | — | #42 | [x] |",
			"| T2 | Segundo ticket | T1 | — | [x] |",
		)

		out, err := bashWithEnv(t, ". ./lib/story.sh && close_ticket_issues "+story,
			"PATH="+fakeBin+":"+os.Getenv("PATH"),
			"GH_LOG="+ghLog,
		)
		if err != nil {
			t.Fatalf("close_ticket_issues falhou: %v\nsaída:\n%s", err, out)
		}

		log, _ := os.ReadFile(ghLog)
		if !strings.Contains(string(log), "issue close 42") {
			t.Errorf("esperava chamada 'gh issue close 42'; log:\n%s", string(log))
		}
		if strings.Count(string(log), "issue close") != 1 {
			t.Errorf("esperava exatamente 1 chamada 'gh issue close' (T2 não tem Issue); log:\n%s", string(log))
		}
	})

	t.Run("story sem nenhuma issue registrada nao chama gh", func(t *testing.T) {
		fakeBin, ghLog := newFakeGh(t)
		story := writeStoryFixture(t,
			"## Tickets",
			"| # | Descrição | Depende de | Issue | Status |",
			"|---|-----------|------------|-------|--------|",
			"| T1 | Primeiro ticket | — | — | [x] |",
		)

		out, err := bashWithEnv(t, ". ./lib/story.sh && close_ticket_issues "+story,
			"PATH="+fakeBin+":"+os.Getenv("PATH"),
			"GH_LOG="+ghLog,
		)
		if err != nil {
			t.Fatalf("close_ticket_issues falhou: %v\nsaída:\n%s", err, out)
		}

		log, _ := os.ReadFile(ghLog)
		if strings.Contains(string(log), "issue close") {
			t.Errorf("não deveria ter chamado 'gh issue close'; log:\n%s", string(log))
		}
	})
}
