#!/bin/sh
# CA6: um classificador com history_retention_minutes definido usa essa janela
# em vez do default global (storage.state_history_minutes), mesmo com o global
# configurado diferente — inclusive 0 = manter pra sempre só pra esse
# classificador (internal/storage/cleaner.go).
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! go test -v -run '^TestCleaner_ClassifierOverrideTakesPrecedenceOverGlobalStateHistoryRetention$' ./internal/storage/... >"$out" 2>&1; then
  echo "CA6 FALHOU: TestCleaner_ClassifierOverrideTakesPrecedenceOverGlobalStateHistoryRetention (internal/storage) falhou"
  cat "$out"
  exit 1
fi
if ! grep -q -- '--- PASS: TestCleaner_ClassifierOverrideTakesPrecedenceOverGlobalStateHistoryRetention' "$out"; then
  echo "CA6 FALHOU: TestCleaner_ClassifierOverrideTakesPrecedenceOverGlobalStateHistoryRetention não encontrado em internal/storage"
  exit 1
fi

echo "CA6 OK"
