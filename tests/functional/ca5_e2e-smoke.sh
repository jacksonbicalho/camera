#!/bin/sh
# CA5: a suíte de smoke Playwright roda ponta-a-ponta contra o harness via
# scripts/e2e.sh e passa.
set -eu
cd "$(git rev-parse --show-toplevel)"

[ -f scripts/e2e.sh ] || { echo "CA5 FALHOU: scripts/e2e.sh não existe ainda"; exit 1; }
[ -f e2e/tests/smoke.spec.ts ] || { echo "CA5 FALHOU: e2e/tests/smoke.spec.ts não existe ainda"; exit 1; }

bash scripts/e2e.sh || { echo "CA5 FALHOU: scripts/e2e.sh não passou"; exit 1; }

echo "CA5 OK"
