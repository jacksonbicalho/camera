package scripts

import (
	"os"
	"strings"
	"testing"
)

func TestIssueTemplateTicket(t *testing.T) {
	content, err := os.ReadFile("../.github/ISSUE_TEMPLATE/ticket.md")
	if err != nil {
		t.Fatalf("ler .github/ISSUE_TEMPLATE/ticket.md: %v", err)
	}
	doc := string(content)

	t.Run("CA2: tem frontmatter padrao de issue template (name/about/title)", func(t *testing.T) {
		for _, field := range []string{"name:", "about:", "title:"} {
			if !strings.Contains(doc, field) {
				t.Errorf("frontmatter sem campo %q; conteúdo:\n%s", field, doc)
			}
		}
	})
}
