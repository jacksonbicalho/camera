package server

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// minimalValidMP4 é um MP4 estruturalmente válido mínimo (ftyp + mdat vazio + moov
// vazio) — findChunkForTime pula candidatos sem o átomo moov (storage.IsValidMP4, chunk
// ainda em gravação/nunca finalizado), então os testes precisam de fixtures reais, não
// bytes arbitrários.
func minimalValidMP4() []byte {
	return []byte{
		0, 0, 0, 24, 'f', 't', 'y', 'p',
		'i', 's', 'o', 'm', 0, 0, 0, 0,
		'i', 's', 'o', 'm', 'm', 'p', '4', '1',
		0, 0, 0, 8, 'm', 'd', 'a', 't',
		0, 0, 0, 8, 'm', 'o', 'o', 'v',
	}
}

func TestFindChunkForTime(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "cam1", "2026/06/16")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"20260616180337.mp4", "20260616180407.mp4", "20260616180437.mp4"} {
		if err := os.WriteFile(filepath.Join(dir, name), minimalValidMP4(), 0644); err != nil {
			t.Fatal(err)
		}
	}
	// 18:04:20 cai no chunk que começa 18:04:07 (offset ~13s)
	ts := time.Date(2026, 6, 16, 18, 4, 20, 0, time.UTC)
	path, off, ok := findChunkForTime(root, "cam1", ts)
	if !ok {
		t.Fatal("esperava achar o chunk")
	}
	if filepath.Base(path) != "20260616180407.mp4" {
		t.Fatalf("chunk errado: %s", filepath.Base(path))
	}
	if off < 12 || off > 14 {
		t.Fatalf("offset ~13s esperado, got %v", off)
	}
}

// TestFindChunkForTime_SkipsUnfinalizedActiveChunk reproduz o bug real: o candidato mais
// recente cobrindo `t` é o chunk ATIVO (ffmpeg ainda escrevendo — `-f segment` só grava o
// átomo moov na rotação), então `t` cai dentro dele mas ele não é extraível. Antes do fix,
// findChunkForTime devolvia esse chunk mesmo assim e a extração de frame falhava sempre
// ("frame extraction failed") — intermitente, dependendo de `t` cair no chunk que acabou
// de fechar ou no que ainda está aberto. Agora cai pro chunk fechado anterior.
func TestFindChunkForTime_SkipsUnfinalizedActiveChunk(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "cam1", "2026/06/16")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "20260616180337.mp4"), minimalValidMP4(), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "20260616180407.mp4"), minimalValidMP4(), 0644); err != nil {
		t.Fatal(err)
	}
	// Chunk ATIVO — sem moov (ainda "sendo escrito"), é o candidato mais recente cobrindo t.
	if err := os.WriteFile(filepath.Join(dir, "20260616180437.mp4"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	// 18:04:50 cairia no chunk ativo (18:04:37) se ele fosse considerado — deve cair pro
	// chunk fechado anterior (18:04:07) em vez disso.
	ts := time.Date(2026, 6, 16, 18, 4, 50, 0, time.UTC)
	path, off, ok := findChunkForTime(root, "cam1", ts)
	if !ok {
		t.Fatal("esperava achar o chunk fechado anterior")
	}
	if filepath.Base(path) != "20260616180407.mp4" {
		t.Fatalf("chunk errado: %s (esperava pular o ativo sem moov)", filepath.Base(path))
	}
	if off < 42 || off > 44 {
		t.Fatalf("offset ~43s esperado, got %v", off)
	}
}

func TestFindChunkForTimeBeforeFirst(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "cam1", "2026/06/16")
	os.MkdirAll(dir, 0755)
	os.WriteFile(filepath.Join(dir, "20260616180407.mp4"), []byte("x"), 0644)
	// antes do primeiro chunk → não encontrado
	ts := time.Date(2026, 6, 16, 18, 0, 0, 0, time.UTC)
	if _, _, ok := findChunkForTime(root, "cam1", ts); ok {
		t.Fatal("não deveria achar chunk antes do primeiro")
	}
}

func TestFindChunkForTimeNoDir(t *testing.T) {
	if _, _, ok := findChunkForTime(t.TempDir(), "cam1", time.Now()); ok {
		t.Fatal("esperava não encontrado sem gravações")
	}
}
