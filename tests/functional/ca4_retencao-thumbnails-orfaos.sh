#!/bin/sh
# CA4: excluir um classificador de state remove state_history/state_samples
# daquele classificador do disco, sem afetar os de outro classificador
# (internal/server/state_classifiers.go, handleStateClassifierDelete).
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! go test -v -run '^TestHandleStateClassifierDelete_RemovesDiskDirs$' ./internal/server/... >"$out" 2>&1; then
  echo "CA4 FALHOU: TestHandleStateClassifierDelete_RemovesDiskDirs (internal/server) falhou"
  cat "$out"
  exit 1
fi
if ! grep -q -- '--- PASS: TestHandleStateClassifierDelete_RemovesDiskDirs' "$out"; then
  echo "CA4 FALHOU: TestHandleStateClassifierDelete_RemovesDiskDirs não encontrado em internal/server"
  exit 1
fi

echo "CA4 OK"
