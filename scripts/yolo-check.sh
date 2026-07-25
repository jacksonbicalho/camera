#!/usr/bin/env bash
# Roda os testes do serviço YOLO (services/yolo) via Docker numa imagem Python slim.
#
# Os testes stubam as deps pesadas (torch/ultralytics/cv2) via sys.modules, então
# NÃO precisam do torch/ultralytics instalados — só fastapi/pydantic/pyyaml/httpx/
# pytest. Isso mantém o gate rápido (segundos) e sem GPU. Espelha a ideia do
# frontend-check.sh: caminho ABSOLUTO derivado do script, cache em volume nomeado.
#
# Uso:
#   scripts/yolo-check.sh          # suíte inteira
#   scripts/yolo-check.sh -k caN   # só os testes cujo nome casa (pytest -k) —
#                                   # usado por CAs anotados (auto: scripts/check.sh)
#                                   # pra rodar isolado durante o desenvolvimento
#                                   # (ver "Testes funcionais" em docs/workflow.md);
#                                   # `-k` sem casar nada faz o pytest sair com
#                                   # status != 0 ("no tests ran"), nunca passa em silêncio.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SVC="$ROOT/services/yolo"

docker run --rm \
  -v "$SVC":/app -v camera-pip-cache:/cache \
  -w /app -e PIP_CACHE_DIR=/cache -e HOME=/tmp \
  python:3.12-slim \
  sh -c 'pip install --quiet --disable-pip-version-check fastapi pydantic pyyaml httpx pytest && python -m pytest -q "$@"' sh "$@"
