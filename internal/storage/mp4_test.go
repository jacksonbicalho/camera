package storage

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// minimalValidMP4 returns the bytes of a minimal but structurally valid MP4 file:
// ftyp(24) + mdat(8, empty) + moov(8, empty).
func minimalValidMP4() []byte {
	return []byte{
		// ftyp: size=24
		0, 0, 0, 24, 'f', 't', 'y', 'p',
		'i', 's', 'o', 'm', 0, 0, 0, 0,
		'i', 's', 'o', 'm', 'm', 'p', '4', '1',
		// mdat: size=8, no payload
		0, 0, 0, 8, 'm', 'd', 'a', 't',
		// moov: size=8, no payload
		0, 0, 0, 8, 'm', 'o', 'o', 'v',
	}
}

func TestIsValidMP4_ValidFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ok.mp4")
	if err := os.WriteFile(path, minimalValidMP4(), 0644); err != nil {
		t.Fatal(err)
	}
	if !IsValidMP4(path) {
		t.Error("expected valid MP4 to return true")
	}
}

func TestIsValidMP4_CorruptFile_RandomBytes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "corrupt.mp4")
	if err := os.WriteFile(path, []byte("this is not an mp4 file"), 0644); err != nil {
		t.Fatal(err)
	}
	if IsValidMP4(path) {
		t.Error("expected corrupt file (random bytes) to return false")
	}
}

func TestIsValidMP4_EmptyFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "empty.mp4")
	if err := os.WriteFile(path, []byte{}, 0644); err != nil {
		t.Fatal(err)
	}
	if IsValidMP4(path) {
		t.Error("expected empty file to return false")
	}
}

func TestIsValidMP4_MissingFile(t *testing.T) {
	if IsValidMP4(filepath.Join(t.TempDir(), "nonexistent.mp4")) {
		t.Error("expected missing file to return false")
	}
}

func TestIsValidMP4_NoMoovAtom(t *testing.T) {
	// ftyp + mdat only — no moov
	b := []byte{
		0, 0, 0, 24, 'f', 't', 'y', 'p',
		'i', 's', 'o', 'm', 0, 0, 0, 0,
		'i', 's', 'o', 'm', 'm', 'p', '4', '1',
		0, 0, 0, 8, 'm', 'd', 'a', 't',
	}
	path := filepath.Join(t.TempDir(), "nomoov.mp4")
	if err := os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
	if IsValidMP4(path) {
		t.Error("expected file without moov atom to return false")
	}
}

// mvhdBox builds a minimal (non spec-padded, but structurally valid for our
// parser) "mvhd" box: version 0 uses 32-bit timescale/duration fields after
// 4-byte creation/modification times; version 1 uses 64-bit fields after
// 8-byte creation/modification times. No matrix/pre_defined data — the
// parser only needs to read up to duration and then skip to the end of the
// box using its own declared size, so trailing padding is irrelevant.
func mvhdBox(version byte, timescale uint32, duration uint64) []byte {
	var body []byte
	body = append(body, version, 0, 0, 0) // version + flags
	if version == 1 {
		body = append(body, make([]byte, 16)...) // creation_time + modification_time (8+8)
		ts := make([]byte, 4)
		putU32(ts, timescale)
		body = append(body, ts...)
		dur := make([]byte, 8)
		putU64(dur, duration)
		body = append(body, dur...)
	} else {
		body = append(body, make([]byte, 8)...) // creation_time + modification_time (4+4)
		ts := make([]byte, 4)
		putU32(ts, timescale)
		body = append(body, ts...)
		dur := make([]byte, 4)
		putU32(dur, uint32(duration))
		body = append(body, dur...)
	}
	size := 8 + len(body)
	box := make([]byte, 0, size)
	sz := make([]byte, 4)
	putU32(sz, uint32(size))
	box = append(box, sz...)
	box = append(box, 'm', 'v', 'h', 'd')
	box = append(box, body...)
	return box
}

func putU32(b []byte, v uint32) {
	b[0] = byte(v >> 24)
	b[1] = byte(v >> 16)
	b[2] = byte(v >> 8)
	b[3] = byte(v)
}

func putU64(b []byte, v uint64) {
	for i := 0; i < 8; i++ {
		b[i] = byte(v >> (56 - 8*i))
	}
}

// mp4WithMvhd builds ftyp + mdat + moov(mvhd) — moov's size wraps its mvhd child.
func mp4WithMvhd(mvhd []byte) []byte {
	moovBody := mvhd
	moov := make([]byte, 0, 8+len(moovBody))
	sz := make([]byte, 4)
	putU32(sz, uint32(8+len(moovBody)))
	moov = append(moov, sz...)
	moov = append(moov, 'm', 'o', 'o', 'v')
	moov = append(moov, moovBody...)

	b := []byte{
		0, 0, 0, 24, 'f', 't', 'y', 'p',
		'i', 's', 'o', 'm', 0, 0, 0, 0,
		'i', 's', 'o', 'm', 'm', 'p', '4', '1',
		0, 0, 0, 8, 'm', 'd', 'a', 't',
	}
	return append(b, moov...)
}

func TestMP4Duration(t *testing.T) {
	t.Run("CA2: extrai a duração real de um MP4 válido a partir do átomo mvhd", func(t *testing.T) {
		t.Run("versão 0 (32 bits) — timescale/duration reais observados em gravações do projeto", func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "v0.mp4")
			b := mp4WithMvhd(mvhdBox(0, 1000, 10000)) // 10000/1000 = 10s
			if err := os.WriteFile(path, b, 0644); err != nil {
				t.Fatal(err)
			}
			dur, ok := MP4Duration(path)
			if !ok {
				t.Fatal("expected ok=true for valid mvhd")
			}
			if dur != 10*time.Second {
				t.Errorf("expected 10s, got %v", dur)
			}
		})

		t.Run("versão 1 (64 bits)", func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "v1.mp4")
			b := mp4WithMvhd(mvhdBox(1, 1000, 5000)) // 5000/1000 = 5s
			if err := os.WriteFile(path, b, 0644); err != nil {
				t.Fatal(err)
			}
			dur, ok := MP4Duration(path)
			if !ok {
				t.Fatal("expected ok=true for valid mvhd v1")
			}
			if dur != 5*time.Second {
				t.Errorf("expected 5s, got %v", dur)
			}
		})

		t.Run("moov sem mvhd retorna ok=false", func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "nomvhd.mp4")
			if err := os.WriteFile(path, minimalValidMP4(), 0644); err != nil {
				t.Fatal(err)
			}
			if _, ok := MP4Duration(path); ok {
				t.Error("expected ok=false when moov has no mvhd child")
			}
		})

		t.Run("sem moov nenhum retorna ok=false", func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "nomoov.mp4")
			b := []byte{
				0, 0, 0, 24, 'f', 't', 'y', 'p',
				'i', 's', 'o', 'm', 0, 0, 0, 0,
				'i', 's', 'o', 'm', 'm', 'p', '4', '1',
				0, 0, 0, 8, 'm', 'd', 'a', 't',
			}
			if err := os.WriteFile(path, b, 0644); err != nil {
				t.Fatal(err)
			}
			if _, ok := MP4Duration(path); ok {
				t.Error("expected ok=false when there is no moov atom")
			}
		})
	})
}

func TestIsValidMP4_ExtendedSizeAtom(t *testing.T) {
	// ftyp with extended 64-bit size (size field = 1), followed by moov
	// ftyp total = 8 (hdr) + 8 (ext-size) + 12 (content) = 28 bytes
	b := make([]byte, 0, 36)
	b = append(b,
		// ftyp header: size=1 (extended), type='ftyp'
		0, 0, 0, 1, 'f', 't', 'y', 'p',
		// extended size = 28
		0, 0, 0, 0, 0, 0, 0, 28,
		// content: brand + version + compat
		'i', 's', 'o', 'm', 0, 0, 0, 0, 'i', 's', 'o', 'm',
	)
	// moov
	b = append(b, 0, 0, 0, 8, 'm', 'o', 'o', 'v')

	path := filepath.Join(t.TempDir(), "extended.mp4")
	if err := os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
	if !IsValidMP4(path) {
		t.Error("expected MP4 with extended-size ftyp atom to return true")
	}
}
