package scripts

import (
	"strings"
	"testing"
)

func TestResolveTicketIssue(t *testing.T) {
	story := writeStoryFixture(t,
		"## Tickets",
		"| # | Descrição | Depende de | Issue | Status |",
		"|---|-----------|------------|-------|--------|",
		"| T1 | Primeiro ticket | — | #42 | [] |",
		"| T2 | Segundo ticket | T1 | — | [] |",
	)

	t.Run("CA5: resolve o numero de uma issue ja registrada (Tn -> issue)", func(t *testing.T) {
		out, err := bash(t, ". ./lib/story.sh && resolve_ticket_issue "+story+" T1")
		if err != nil {
			t.Fatalf("resolve_ticket_issue falhou: %v\nsaída:\n%s", err, out)
		}
		if strings.TrimSpace(out) != "42" {
			t.Errorf("esperava '42', veio %q", out)
		}
	})

	t.Run("ticket sem Issue registrada resolve para vazio", func(t *testing.T) {
		out, err := bash(t, ". ./lib/story.sh && resolve_ticket_issue "+story+" T2")
		if err != nil {
			t.Fatalf("resolve_ticket_issue falhou: %v\nsaída:\n%s", err, out)
		}
		if strings.TrimSpace(out) != "" {
			t.Errorf("esperava vazio para T2 sem issue, veio %q", out)
		}
	})
}

func TestResolveTicketByIssue(t *testing.T) {
	story := writeStoryFixture(t,
		"## Tickets",
		"| # | Descrição | Depende de | Issue | Status |",
		"|---|-----------|------------|-------|--------|",
		"| T1 | Primeiro ticket | — | #42 | [] |",
		"| T2 | Segundo ticket | T1 | #43 | [] |",
	)

	t.Run("CA5: resolve o Tn a partir do numero da issue (issue -> Tn, base do comando /act)", func(t *testing.T) {
		out, err := bash(t, ". ./lib/story.sh && resolve_ticket_by_issue "+story+" 43")
		if err != nil {
			t.Fatalf("resolve_ticket_by_issue falhou: %v\nsaída:\n%s", err, out)
		}
		if strings.TrimSpace(out) != "T2" {
			t.Errorf("esperava 'T2', veio %q", out)
		}
	})

	t.Run("numero de issue desconhecido resolve para vazio", func(t *testing.T) {
		out, err := bash(t, ". ./lib/story.sh && resolve_ticket_by_issue "+story+" 999")
		if err != nil {
			t.Fatalf("resolve_ticket_by_issue falhou: %v\nsaída:\n%s", err, out)
		}
		if strings.TrimSpace(out) != "" {
			t.Errorf("esperava vazio para issue desconhecida, veio %q", out)
		}
	})
}

func TestClosesRefs(t *testing.T) {
	t.Run("CA7: gera Closes #N para cada ticket com Issue registrada", func(t *testing.T) {
		story := writeStoryFixture(t,
			"## Tickets",
			"| # | Descrição | Depende de | Issue | Status |",
			"|---|-----------|------------|-------|--------|",
			"| T1 | Primeiro ticket | — | #42 | [x] |",
			"| T2 | Segundo ticket | T1 | #43 | [x] |",
			"| T3 | Terceiro ticket | T2 | — | [] |",
		)

		out, err := bash(t, ". ./lib/story.sh && closes_refs "+story)
		if err != nil {
			t.Fatalf("closes_refs falhou: %v\nsaída:\n%s", err, out)
		}
		got := strings.TrimSpace(out)
		if !strings.Contains(got, "#42") || !strings.Contains(got, "#43") {
			t.Errorf("esperava referências a #42 e #43, veio %q", got)
		}
		if strings.Contains(got, "T3") {
			t.Errorf("ticket sem Issue não deveria aparecer: %q", got)
		}
	})

	t.Run("CA7: sem nenhuma issue registrada, closes_refs retorna vazio", func(t *testing.T) {
		story := writeStoryFixture(t,
			"## Tickets",
			"| # | Descrição | Depende de | Issue | Status |",
			"|---|-----------|------------|-------|--------|",
			"| T1 | Primeiro ticket | — | — | [] |",
		)
		out, err := bash(t, ". ./lib/story.sh && closes_refs "+story)
		if err != nil {
			t.Fatalf("closes_refs falhou: %v\nsaída:\n%s", err, out)
		}
		if strings.TrimSpace(out) != "" {
			t.Errorf("esperava vazio, veio %q", strings.TrimSpace(out))
		}
	})
}
