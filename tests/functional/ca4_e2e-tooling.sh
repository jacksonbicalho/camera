#!/bin/sh
# CA4: o pacote e2e/ tem TypeScript, lint e prettier configurados e passando,
# gerenciado inteiramente por bun (sem exigir bun no host).
set -eu
cd "$(git rev-parse --show-toplevel)"

[ -f e2e/package.json ] || { echo "CA4 FALHOU: e2e/package.json não existe ainda"; exit 1; }

docker run --rm \
  -v "$(pwd)/e2e":/app -v camera-bun-cache:/root/.bun \
  -w /app oven/bun:1 \
  sh -c "bun install >/tmp/bun-install.log 2>&1 && bunx tsc --noEmit && bunx eslint . && bunx prettier --check ." \
  || { echo "CA4 FALHOU: typecheck/lint/prettier de e2e/ falhou"; exit 1; }

echo "CA4 OK"
