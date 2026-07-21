#!/bin/sh
# CA5: a rotina de limpeza do Cleaner remove do banco e do disco as transições
# de camera_state_history mais velhas que storage.state_history_minutes (config
# global, mesmo padrão de with_motion_minutes/without_motion_minutes).
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! go test -v -run '^TestCleaner_PurgesStateHistoryOlderThanGlobalRetention$' ./internal/storage/... >"$out" 2>&1; then
  echo "CA5 FALHOU: TestCleaner_PurgesStateHistoryOlderThanGlobalRetention (internal/storage) falhou"
  cat "$out"
  exit 1
fi
if ! grep -q -- '--- PASS: TestCleaner_PurgesStateHistoryOlderThanGlobalRetention' "$out"; then
  echo "CA5 FALHOU: TestCleaner_PurgesStateHistoryOlderThanGlobalRetention não encontrado em internal/storage"
  exit 1
fi

echo "CA5 OK"
