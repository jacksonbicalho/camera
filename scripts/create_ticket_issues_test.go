package scripts

import (
	"os"
	"strings"
	"testing"
)

func TestCreateTicketIssues(t *testing.T) {
	run := func(t *testing.T, story, fakeBin, ghLog string) (string, error) {
		t.Helper()
		return bashWithEnv(t, "CREATE_TICKET_ISSUES_SH_LIB=1 . ./create-ticket-issues.sh && create_ticket_issues "+story,
			"PATH="+fakeBin+":"+os.Getenv("PATH"),
			"GH_LOG="+ghLog,
		)
	}

	t.Run("CA3: cria uma issue por ticket sem Issue registrada e grava o numero na tabela", func(t *testing.T) {
		fakeBin, ghLog := newFakeGh(t)
		story := writeStoryFixture(t,
			"## Tickets",
			"| # | Descrição | Depende de | Issue | Status |",
			"|---|-----------|------------|-------|--------|",
			"| T1 | Primeiro ticket | — | — | [] |",
			"",
			"### T1 — Primeiro ticket",
			"Escopo do primeiro ticket.",
		)

		out, err := run(t, story, fakeBin, ghLog)
		if err != nil {
			t.Fatalf("create_ticket_issues falhou: %v\nsaída:\n%s", err, out)
		}

		log, _ := os.ReadFile(ghLog)
		if !strings.Contains(string(log), "issue create") {
			t.Fatalf("esperava chamada 'gh issue create'; log:\n%s", string(log))
		}

		got, _ := os.ReadFile(story)
		if strings.Contains(string(got), "| T1 | Primeiro ticket | — | — | [] |") {
			t.Errorf("Issue de T1 não foi gravada na tabela; story:\n%s", string(got))
		}
		if !strings.Contains(string(got), "#999") {
			t.Errorf("esperava número de issue #999 gravado na tabela; story:\n%s", string(got))
		}
	})

	t.Run("CA4: nao recria issue para ticket que ja tem Issue registrada (idempotente)", func(t *testing.T) {
		fakeBin, ghLog := newFakeGh(t)
		story := writeStoryFixture(t,
			"## Tickets",
			"| # | Descrição | Depende de | Issue | Status |",
			"|---|-----------|------------|-------|--------|",
			"| T1 | Primeiro ticket | — | #55 | [] |",
			"",
			"### T1 — Primeiro ticket",
			"Escopo do primeiro ticket.",
		)

		out, err := run(t, story, fakeBin, ghLog)
		if err != nil {
			t.Fatalf("create_ticket_issues falhou: %v\nsaída:\n%s", err, out)
		}

		log, _ := os.ReadFile(ghLog)
		if strings.Contains(string(log), "issue create") {
			t.Errorf("não deveria ter chamado 'gh issue create' pra ticket já com Issue registrada; log:\n%s", string(log))
		}

		got, _ := os.ReadFile(story)
		if !strings.Contains(string(got), "#55") {
			t.Errorf("Issue existente não deveria ter sido alterada; story:\n%s", string(got))
		}
	})
}
