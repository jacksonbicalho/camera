package storage

import (
	"encoding/binary"
	"io"
	"os"
	"time"
)

// IsValidMP4 reports whether the file at path contains a moov atom,
// which indicates a properly closed MP4. It only reads atom headers
// and seeks past payloads, so it is O(number of top-level atoms).
func IsValidMP4(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()

	var buf [8]byte
	for {
		if _, err := io.ReadFull(f, buf[:]); err != nil {
			return false
		}
		size := uint32(buf[0])<<24 | uint32(buf[1])<<16 | uint32(buf[2])<<8 | uint32(buf[3])
		typ := string(buf[4:8])

		if typ == "moov" {
			return true
		}

		var skip int64
		switch {
		case size == 0:
			return false // atom extends to EOF; no moov found
		case size == 1:
			// Extended 64-bit size: next 8 bytes hold the real size.
			var ext [8]byte
			if _, err := io.ReadFull(f, ext[:]); err != nil {
				return false
			}
			actual := binary.BigEndian.Uint64(ext[:])
			skip = int64(actual) - 16 // already read 16 bytes (8 hdr + 8 ext)
		default:
			skip = int64(size) - 8
		}

		if skip < 0 {
			return false
		}
		if skip > 0 {
			if _, err := f.Seek(skip, io.SeekCurrent); err != nil {
				return false
			}
		}
	}
}

// MP4Duration returns the file's real playable duration, read from the
// "mvhd" (movie header) atom inside "moov" — the definitive account of how
// much content the file actually has, independent of any external
// assumption (e.g. the wall-clock gap until the next recording chunk
// starts, which is all callers had to go on before this existed: see
// work_progress/analysis/202608150015_ended-at-duracao-real.md). ok=false
// covers any parse failure: no moov, no mvhd inside it, or a malformed box
// — same spirit as IsValidMP4's return, which this function does not
// change or depend on.
func MP4Duration(path string) (time.Duration, bool) {
	f, err := os.Open(path)
	if err != nil {
		return 0, false
	}
	defer f.Close()

	moovSize, ok := seekIntoTopLevelAtom(f, "moov")
	if !ok {
		return 0, false
	}
	mvhdBody, ok := readChildAtomBody(f, moovSize, "mvhd")
	if !ok {
		return 0, false
	}
	return parseMvhd(mvhdBody)
}

// seekIntoTopLevelAtom scans top-level atoms from f's current position (same
// walk as IsValidMP4) looking for typ, leaving f positioned right after its
// header — ready to read/seek within it — and returning its body size.
// Doesn't allocate: a top-level atom's declared size (e.g. mdat, which is
// legitimately as large as the whole recording) is only ever used to seek
// past it, never to size a read.
func seekIntoTopLevelAtom(f *os.File, typ string) (int64, bool) {
	var buf [8]byte
	for {
		if _, err := io.ReadFull(f, buf[:]); err != nil {
			return 0, false
		}
		size := uint32(buf[0])<<24 | uint32(buf[1])<<16 | uint32(buf[2])<<8 | uint32(buf[3])
		atomType := string(buf[4:8])

		var bodySize int64
		switch {
		case size == 0:
			return 0, false // atom extends to EOF; typ not found before it
		case size == 1:
			var ext [8]byte
			if _, err := io.ReadFull(f, ext[:]); err != nil {
				return 0, false
			}
			bodySize = int64(binary.BigEndian.Uint64(ext[:])) - 16 // already read 16 bytes (8 hdr + 8 ext)
		default:
			bodySize = int64(size) - 8
		}
		if bodySize < 0 {
			return 0, false
		}
		if atomType == typ {
			return bodySize, true
		}
		if bodySize > 0 {
			if _, err := f.Seek(bodySize, io.SeekCurrent); err != nil {
				return 0, false
			}
		}
	}
}

// maxMvhdBodyRead bounds how many bytes of an "mvhd" box we ever materialize
// in memory — comfortably above the largest real field set parseMvhd reads
// (32 bytes, version 1) plus room for the matrix/pre_defined padding a real
// mvhd carries (real recordings from this project: 100 bytes). A declared
// mvhd body larger than this is either padding we don't need or a corrupt/
// malicious size field — either way, reading only the prefix is enough
// (parseMvhd only looks at the first ≤32 bytes).
const maxMvhdBodyRead = 256

// readChildAtomBody walks the children of a parent atom whose body is
// parentBodySize bytes long, starting at f's current position (right after
// the parent's own header), looking for typ. Unlike seekIntoTopLevelAtom,
// this DOES read the body — but only up to maxMvhdBodyRead bytes, and only
// once typ is found, so a corrupt/oversized declared size (moov's real
// children, like the sample tables in trak/stbl, can legitimately be several
// MB) never drives an unbounded allocation — this walk only cares about
// finding "mvhd", small and singular by spec.
func readChildAtomBody(f *os.File, parentBodySize int64, typ string) ([]byte, bool) {
	var consumed int64
	var buf [8]byte
	for consumed+8 <= parentBodySize {
		if _, err := io.ReadFull(f, buf[:]); err != nil {
			return nil, false
		}
		size := int64(binary.BigEndian.Uint32(buf[:4]))
		atomType := string(buf[4:8])
		if size < 8 || consumed+size > parentBodySize {
			return nil, false
		}
		bodySize := size - 8
		if atomType == typ {
			readSize := bodySize
			if readSize > maxMvhdBodyRead {
				readSize = maxMvhdBodyRead
			}
			body := make([]byte, readSize)
			if _, err := io.ReadFull(f, body); err != nil {
				return nil, false
			}
			return body, true
		}
		if bodySize > 0 {
			if _, err := f.Seek(bodySize, io.SeekCurrent); err != nil {
				return nil, false
			}
		}
		consumed += size
	}
	return nil, false
}

// parseMvhd reads timescale+duration from an mvhd box's body (everything
// after its 8-byte atom header). Version 0 uses 32-bit creation/
// modification/duration fields; version 1 uses 64-bit ones for
// creation/modification/duration (timescale is always 32-bit). Real
// recordings from this project use version 0.
func parseMvhd(body []byte) (time.Duration, bool) {
	if len(body) < 1 {
		return 0, false
	}
	var timescale uint32
	var duration uint64
	if body[0] == 1 {
		const need = 4 + 8 + 8 + 4 + 8 // version+flags, creation, modification, timescale, duration
		if len(body) < need {
			return 0, false
		}
		timescale = binary.BigEndian.Uint32(body[20:24])
		duration = binary.BigEndian.Uint64(body[24:32])
	} else {
		const need = 4 + 4 + 4 + 4 + 4
		if len(body) < need {
			return 0, false
		}
		timescale = binary.BigEndian.Uint32(body[12:16])
		duration = uint64(binary.BigEndian.Uint32(body[16:20]))
	}
	if timescale == 0 {
		return 0, false
	}
	return time.Duration(duration) * time.Second / time.Duration(timescale), true
}
