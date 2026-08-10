package storage

import "testing"

func TestSlugify(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"Corredor da Frente", "corredor-da-frente"},
		{"corredor-da-frente", "corredor-da-frente"},
		{"Câmera 01", "camera-01"},
		{"portão de entrada", "portao-de-entrada"},
		{"Câmera Garagem Nº1", "camera-garagem-n-1"},
		{"  spaces  ", "spaces"},
		{"cam/1", "cam-1"},
	}
	for _, tc := range cases {
		got := slugify(tc.in)
		if got != tc.want {
			t.Errorf("slugify(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
