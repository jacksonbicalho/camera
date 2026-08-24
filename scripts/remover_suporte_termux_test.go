package scripts

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

func TestRemoverTermuxAndroid(t *testing.T) {
	t.Run("CA2: install.sh não referencia mais Termux/Android/proot-distro/runit e continua sintaticamente válido", func(t *testing.T) {
		content, err := os.ReadFile("install.sh")
		if err != nil {
			t.Fatalf("ler scripts/install.sh: %v", err)
		}
		lower := strings.ToLower(string(content))

		t.Run("sem termos termux/android/proot/runit", func(t *testing.T) {
			for _, term := range []string{"termux", "android", "proot", "runit"} {
				if strings.Contains(lower, term) {
					t.Errorf("scripts/install.sh ainda contém %q", term)
				}
			}
		})

		t.Run("sintaxe válida (sh -n)", func(t *testing.T) {
			cmd := exec.Command("sh", "-n", "install.sh")
			if out, err := cmd.CombinedOutput(); err != nil {
				t.Errorf("sh -n install.sh falhou: %v\n%s", err, out)
			}
		})
	})

	t.Run("CA3: docs/installation.md e README.md não mencionam mais Termux/Android como método de instalação", func(t *testing.T) {
		for _, path := range []string{"../docs/installation.md", "../README.md"} {
			content, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("ler %s: %v", path, err)
			}
			lower := strings.ToLower(string(content))
			for _, term := range []string{"termux", "android"} {
				if strings.Contains(lower, term) {
					t.Errorf("%s ainda contém %q", path, term)
				}
			}
		}
	})

	t.Run("CA4: comentários de PIE em Makefile e release.yml não citam mais Android/Termux como motivação", func(t *testing.T) {
		for _, path := range []string{"../Makefile", "../.github/workflows/release.yml"} {
			content, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("ler %s: %v", path, err)
			}
			lower := strings.ToLower(string(content))
			for _, term := range []string{"termux", "android"} {
				if strings.Contains(lower, term) {
					t.Errorf("%s ainda contém %q", path, term)
				}
			}
		}
	})
}
