#!/bin/sh
# CA6: o CI (.github/workflows/ci.yml) tem um job `e2e` bloqueante (roda em
# todo PR) que executa a suíte via scripts/e2e.sh.
set -eu
cd "$(git rev-parse --show-toplevel)"

CI=.github/workflows/ci.yml
[ -f "$CI" ] || { echo "CA6 FALHOU: $CI não existe"; exit 1; }

grep -qE '^\s*e2e:' "$CI" || { echo "CA6 FALHOU: job 'e2e' não encontrado em $CI"; exit 1; }
grep -q 'scripts/e2e.sh' "$CI" || { echo "CA6 FALHOU: job e2e não invoca scripts/e2e.sh"; exit 1; }

echo "CA6 OK"
