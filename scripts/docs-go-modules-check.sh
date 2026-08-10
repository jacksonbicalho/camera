#!/usr/bin/env bash
# docs-go-modules-check.sh — verifica a estrutura de docs/go-modules/ (não a
# qualidade da prosa, isso é code review): todo pacote esperado tem um
# README.md não-vazio, o índice raiz linka todos, e o CLAUDE.md tem um
# ponteiro pra cada um.
#
# Uso:
#   scripts/docs-go-modules-check.sh --cluster <infra|captura|dados|ia|aplicacao>
#   scripts/docs-go-modules-check.sh                 # árvore completa
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Pacotes-folha descobertos dinamicamente (robusto a pacotes novos) — caminho
# relativo a internal/, usando "/" pra subpacotes.
mapfile -t leaf_pkgs < <(find internal -type f -name '*.go' ! -name '*_test.go' -exec dirname {} \; \
    | sed 's#^internal/##' | sort -u)

# Diretórios "pai" que agrupam filhos e também ganham um README próprio
# (não descobertos por `find` porque não têm .go direto) — lista curta,
# atualizada manualmente quando um novo agrupamento desse tipo nascer.
parent_pkgs=(capture transmission detector trainer notifications db)

# Diretórios com README próprio mas sem nenhum .go (ex.: só .sql) — não
# descobertos por `find` nem são um "pai" de subpacotes Go. Lista curta,
# manual.
non_go_pkgs=(db/migrations)

# Clusters da história — usados só pelo modo --cluster.
cluster_infra=(core config exec ffprobe logger)
cluster_captura=(capture capture/rtsp capture/hls recorder transmission transmission/hls transmission/webrtc motion zones discovery)
cluster_dados=(db db/migrations dbbackup storage deviceinfo)
cluster_ia=(analysis detector detector/adapters trainer trainer/adapters stateclass stateengine)
cluster_aplicacao=(server notifications notifications/application notifications/email email release updater)

cluster=""
if [ "${1:-}" = "--cluster" ]; then
    cluster="${2:-}"
    [ -n "$cluster" ] || { echo "❌ --cluster exige um nome (infra|captura|dados|ia|aplicacao)"; exit 1; }
fi

case "$cluster" in
    infra) pkgs=("${cluster_infra[@]}") ;;
    captura) pkgs=("${cluster_captura[@]}") ;;
    dados) pkgs=("${cluster_dados[@]}") ;;
    ia) pkgs=("${cluster_ia[@]}") ;;
    aplicacao) pkgs=("${cluster_aplicacao[@]}") ;;
    "")
        # Árvore completa: todo pacote-folha real + os pais conhecidos + os
        # diretórios sem .go que ainda assim têm README (ex.: migrations).
        pkgs=("${leaf_pkgs[@]}" "${parent_pkgs[@]}" "${non_go_pkgs[@]}")
        ;;
    *)
        echo "❌ cluster desconhecido: $cluster"
        exit 1
        ;;
esac

fail=0

for pkg in "${pkgs[@]}"; do
    readme="docs/go-modules/internal/$pkg/README.md"
    if [ ! -s "$readme" ]; then
        echo "❌ ausente ou vazio: $readme"
        fail=1
        continue
    fi
    if ! grep -q "internal/$pkg" "$readme"; then
        echo "❌ $readme não menciona o próprio caminho (internal/$pkg)"
        fail=1
    fi
done

index="docs/go-modules/README.md"
if [ ! -s "$index" ]; then
    echo "❌ ausente ou vazio: $index"
    fail=1
else
    for pkg in "${pkgs[@]}"; do
        if ! grep -q "internal/$pkg/README.md" "$index"; then
            echo "❌ $index não linka internal/$pkg"
            fail=1
        fi
    done
fi

# CLAUDE.md precisa apontar pra cada pacote — só checado no modo árvore
# completa (nos clusters intermediários o CLAUDE.md pode ainda não ter sido
# tocado pra pacotes de clusters futuros).
if [ -z "$cluster" ]; then
    for pkg in "${pkgs[@]}"; do
        if ! grep -q "docs/go-modules/internal/$pkg" CLAUDE.md; then
            echo "❌ CLAUDE.md não referencia docs/go-modules/internal/$pkg"
            fail=1
        fi
    done
    # README.md (público, GitHub) não repete a tabela — só aponta pro índice.
    if ! grep -q "docs/go-modules/README.md" README.md; then
        echo "❌ README.md não referencia docs/go-modules/README.md"
        fail=1
    fi
fi

if [ "$fail" -eq 0 ]; then
    label="${cluster:-árvore completa}"
    echo "✅ docs/go-modules: $label ok (${#pkgs[@]} pacote(s))"
fi
exit "$fail"
