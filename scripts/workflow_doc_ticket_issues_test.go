package scripts

import (
	"os"
	"strings"
	"testing"
)

// TestWorkflowDocReflectsTicketIssueTracking é o guard da história
// feat/tickets-github-issues: docs/workflow.md documentava explicitamente a
// rejeição de GitHub Issues como mecanismo de tickets ("Issues adicionariam
// latência e estado duplicado") — essa história reverte a decisão, então o
// doc precisa refletir isso, não só o comportamento.
func TestWorkflowDocReflectsTicketIssueTracking(t *testing.T) {
	content, err := os.ReadFile("../docs/workflow.md")
	if err != nil {
		t.Fatalf("ler docs/workflow.md: %v", err)
	}
	doc := string(content)

	t.Run("CA8: nao rejeita mais Issues como mecanismo de tickets", func(t *testing.T) {
		if strings.Contains(doc, "Issues adicionariam latência e estado duplicado") {
			t.Errorf("docs/workflow.md ainda rejeita Issues — atualize a seção Tickets pra refletir a nova decisão")
		}
	})

	t.Run("CA8: documenta o script de criacao de issues e o comando /act", func(t *testing.T) {
		if !strings.Contains(doc, "create-ticket-issues.sh") {
			t.Errorf("docs/workflow.md não menciona scripts/create-ticket-issues.sh")
		}
		if !strings.Contains(doc, "/act") {
			t.Errorf("docs/workflow.md não menciona o comando /act")
		}
	})
}

// TestStoryCommandCallsCreateTicketIssues confirma que o comando REAL que o
// driver executa (.claude/commands/story.md), não só a narrativa em
// docs/workflow.md, dispara a criação das Issues — achado do code review do
// T4: o passo de criação da branch ficava sem o gatilho de
// create-ticket-issues.sh, então docs/workflow.md descrevia um
// comportamento que o comando de verdade não executava.
func TestStoryCommandCallsCreateTicketIssues(t *testing.T) {
	content, err := os.ReadFile("../.claude/commands/story.md")
	if err != nil {
		t.Fatalf("ler .claude/commands/story.md: %v", err)
	}
	if !strings.Contains(string(content), "create-ticket-issues.sh") {
		t.Errorf(".claude/commands/story.md não chama scripts/create-ticket-issues.sh — a criação das Issues não vai disparar de verdade")
	}
}
