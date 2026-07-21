#!/bin/sh
# CA2: um chunk de gravação corrompido (moov atom ausente) tem seu evento de
# movimento e o jpg associado purgados junto — syncRecordings() não deixa
# mais o jpg órfão ao descartar o chunk (internal/storage/cleaner.go).
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! go test -v -run '^TestSyncRecordings_CorruptChunkPurgesMotionAssets$' ./internal/storage/... >"$out" 2>&1; then
  echo "CA2 FALHOU: TestSyncRecordings_CorruptChunkPurgesMotionAssets (internal/storage) falhou"
  cat "$out"
  exit 1
fi
if ! grep -q -- '--- PASS: TestSyncRecordings_CorruptChunkPurgesMotionAssets' "$out"; then
  echo "CA2 FALHOU: TestSyncRecordings_CorruptChunkPurgesMotionAssets não encontrado em internal/storage"
  exit 1
fi

echo "CA2 OK"
