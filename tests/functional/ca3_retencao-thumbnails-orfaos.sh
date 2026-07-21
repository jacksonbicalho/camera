#!/bin/sh
# CA3: diretórios de gravação sem .mp4 mais velhos que a retenção com-movimento
# têm os _motion.jpg residuais removidos pela varredura do Cleaner — rede de
# segurança pra qualquer divergência banco↔disco (internal/storage/cleaner.go).
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! go test -v -run '^TestClean_SweepsOrphanedMotionJPEGsOlderThanRetention$' ./internal/storage/... >"$out" 2>&1; then
  echo "CA3 FALHOU: TestClean_SweepsOrphanedMotionJPEGsOlderThanRetention (internal/storage) falhou"
  cat "$out"
  exit 1
fi
if ! grep -q -- '--- PASS: TestClean_SweepsOrphanedMotionJPEGsOlderThanRetention' "$out"; then
  echo "CA3 FALHOU: TestClean_SweepsOrphanedMotionJPEGsOlderThanRetention não encontrado em internal/storage"
  exit 1
fi

echo "CA3 OK"
