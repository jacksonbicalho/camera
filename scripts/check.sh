#!/usr/bin/env bash
# Roda os checks "verde" e, se tudo passar, marca o 1º Critério de Aceitação da
# story da branch atual como [x].
#
# - Backend SEMPRE: `go build ./...` + `go test -count=1 ./...`
# - Frontend SE `frontend/` mudou (vs develop ou na working tree): frontend-check.sh
# - e2e/ SE `e2e/` mudou (vs develop ou na working tree): e2e-lint-check.sh (tsc/eslint/prettier)
#
# Claude roda isto manualmente (não é hook). Equivale ao "CI local" da história.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Resumo do que quebrou, para o log de um dos checks.
fail_summary() {
    local log="$1"
    # Sinal = teste que falhou ou panic. O rodapé `FAIL <pkg>` fica de fora: ele
    # sozinho não diz nada (um erro de compilação também o imprime), e detectá-lo
    # como sinal impediria o fallback abaixo.
    local signal='--- FAIL|panic:'
    # O `--` encerra o parse de opções: sem ele o grep lê o padrão (que começa
    # com "--") como opção longa e sai com erro de uso, engolindo a saída.
    if grep -qE -- "$signal" "$log"; then
        grep -E -- "$signal|^FAIL" "$log" | head -20
    else
        # Erro de compilação não tem linha de sinal — não deixe a tela vazia.
        tail -25 "$log"
    fi
    echo "· log completo: $log"
}

# Carregado como biblioteca (scripts/check_test.go): só as funções, sem rodar nada.
[ -n "${CHECK_SH_LIB:-}" ] && return 0

echo "→ go build ./..."
if ! go build ./...; then echo "❌ go build falhou"; exit 1; fi

echo "→ go test -count=1 ./..."
if ! go test -count=1 ./... >/tmp/check-go.log 2>&1; then
    echo "❌ go test falhou:"
    fail_summary /tmp/check-go.log
    exit 1
fi
echo "✓ backend verde"

fe_changed=0
git diff --name-only develop...HEAD 2>/dev/null | grep -q '^frontend/' && fe_changed=1
git status --porcelain | grep -qE '^.. frontend/' && fe_changed=1

if [ "$fe_changed" -eq 1 ]; then
    echo "→ frontend mudou: scripts/frontend-check.sh (Docker)"
    if ! bash "$ROOT/scripts/frontend-check.sh" >/tmp/check-fe.log 2>&1; then
        echo "❌ frontend-check falhou:"
        fail_summary /tmp/check-fe.log
        exit 1
    fi
    echo "✓ frontend verde"
else
    echo "· frontend não mudou — pulando"
fi

yolo_changed=0
git diff --name-only develop...HEAD 2>/dev/null | grep -q '^services/yolo/' && yolo_changed=1
git status --porcelain | grep -qE '^.. services/yolo/' && yolo_changed=1

if [ "$yolo_changed" -eq 1 ]; then
    echo "→ services/yolo mudou: scripts/yolo-check.sh (Docker)"
    if ! bash "$ROOT/scripts/yolo-check.sh" >/tmp/check-yolo.log 2>&1; then
        echo "❌ yolo-check falhou:"
        fail_summary /tmp/check-yolo.log
        exit 1
    fi
    echo "✓ yolo verde"
else
    echo "· services/yolo não mudou — pulando"
fi

e2e_changed=0
git diff --name-only develop...HEAD 2>/dev/null | grep -q '^e2e/' && e2e_changed=1
git status --porcelain | grep -qE '^.. e2e/' && e2e_changed=1

if [ "$e2e_changed" -eq 1 ]; then
    echo "→ e2e/ mudou: scripts/e2e-lint-check.sh (Docker)"
    if ! bash "$ROOT/scripts/e2e-lint-check.sh" >/tmp/check-e2e.log 2>&1; then
        echo "❌ e2e-lint-check falhou:"
        fail_summary /tmp/check-e2e.log
        exit 1
    fi
    echo "✓ e2e (tsc/eslint/prettier) verde"
else
    echo "· e2e/ não mudou — pulando"
fi

# ── marca o 1º Critério de Aceitação da story ───────────────────────────────
# resolve_story (lib/story.sh) é a MESMA lógica usada por functional-check.sh/
# record-review.sh/etc.: casa o slug exato da branch (sem normalizar `-`→`_`)
# contra `work_progress/stories/*_<slug>.md`. Manter as duas heurísticas em sync evita que
# check.sh e o resto do pipeline discordem sobre qual story é a atual.
. "$ROOT/scripts/lib/story.sh"
story=$(resolve_story "" 2>/dev/null) || story=""
if [ -z "$story" ]; then
    echo "✅ tudo verde (nenhuma story encontrada para marcar)"
    exit 0
fi

# grep (UTF-8) acha o header; awk acha a 1ª linha de critério; sed marca.
start=$(grep -nE '^## Crit' "$story" | head -1 | cut -d: -f1)
if [ -z "$start" ]; then
    echo "✅ tudo verde (story sem seção de Critérios para marcar)"
    exit 0
fi
firstcrit=$(awk -v s="$start" 'NR>s && /^- \[/{print NR; exit}' "$story")
if [ -n "$firstcrit" ]; then
    sed -i "${firstcrit}s/^- \[[ x]*\]/- [x]/" "$story"
    echo "✅ tudo verde — 1º critério marcado em $(basename "$story")"
else
    echo "✅ tudo verde (nenhum critério encontrado para marcar)"
fi
