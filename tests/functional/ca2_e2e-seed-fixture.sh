#!/bin/sh
# CA2: o seed (e2e/seed) gera um fixture determinístico e completo — banco
# migrado, admin liberado, câmera e N gravações com MP4 servível em disco.
set -eu
cd "$(git rev-parse --show-toplevel)"

[ -f e2e/seed/main.go ] || { echo "CA2 FALHOU: e2e/seed/main.go não existe ainda"; exit 1; }

BIN=/tmp/e2e-seed-ca2
OUT=$(mktemp -d)
trap 'rm -rf "$OUT" "$BIN"' EXIT

go build -o "$BIN" ./e2e/seed 2>/tmp/ca2_build.log || {
  echo "CA2 FALHOU: build de e2e/seed falhou:"; cat /tmp/ca2_build.log; exit 1;
}

"$BIN" -out "$OUT" -port 8099 -recordings 5 >/tmp/ca2_seed.json 2>/tmp/ca2_seed.log || {
  echo "CA2 FALHOU: execução do seed falhou:"; cat /tmp/ca2_seed.log; exit 1;
}

[ -f "$OUT/camera.db" ] || { echo "CA2 FALHOU: camera.db não foi criado"; exit 1; }
[ -f "$OUT/camera.yaml" ] || { echo "CA2 FALHOU: camera.yaml não foi criado"; exit 1; }

n=$(find "$OUT/recordings" -name '*.mp4' 2>/dev/null | wc -l | tr -d ' ')
[ "$n" -ge 5 ] || { echo "CA2 FALHOU: esperava >=5 arquivos .mp4 de gravação, achei $n"; exit 1; }

grep -q '"camera_id"' /tmp/ca2_seed.json || { echo "CA2 FALHOU: stdout do seed não contém camera_id"; exit 1; }
grep -q '"recording_id"' /tmp/ca2_seed.json || { echo "CA2 FALHOU: stdout do seed não contém recording_id"; exit 1; }

echo "CA2 OK"
