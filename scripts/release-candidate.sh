#!/usr/bin/env bash
# Cria/atualiza uma pré-release (release candidate) a partir de develop, sem
# tocar em master — pra testar o binário/imagem Docker antes de cortar a
# release de verdade.
#
# Tag FIXA por ciclo (ex.: v1.4.0-rc, sem número incremental): cada chamada
# força a mesma tag (git push --force). O `softprops/action-gh-release`
# (usado em .github/workflows/release.yml) faz upsert por nome de tag —
# atualiza a release existente (assets + notas) em vez de criar outra. Assim
# só existe UMA entrada de pré-release por versão sendo testada, nunca uma
# por tentativa (evita entupir a lista de Releases no GitHub).
#
# Instalar a -rc gerada não exige nada especial: o binário fica em
#   github.com/<owner>/os-camera/releases/download/<tag>/camera-linux-<arch>
# e a imagem Docker correspondente em
#   jacksonbicalho/os-camera:<versão sem 'v'>   (ex.: docker pull .../os-camera:1.4.0-rc)
#
# Uso:
#   scripts/release-candidate.sh            # cria/atualiza a -rc da versão atual
#   scripts/release-candidate.sh --dry-run  # só mostra a tag que seria criada/atualizada
#   scripts/release-candidate.sh --cleanup  # apaga a -rc do ciclo atual (release real já saiu)

set -euo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; RESET='\033[0m'

DRY_RUN=false
CLEANUP=false
for arg in "$@"; do
    [[ "$arg" == "--dry-run" ]] && DRY_RUN=true
    [[ "$arg" == "--cleanup" ]] && CLEANUP=true
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

for cmd in git gh; do
    command -v "$cmd" &>/dev/null || { echo -e "${RED}Erro: $cmd não encontrado${RESET}" >&2; exit 1; }
done

# Garante que está no branch develop
CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "develop" ]]; then
    echo -e "${RED}Erro: execute o script a partir do branch develop (atual: ${CURRENT_BRANCH}).${RESET}" >&2
    exit 1
fi

# Garante que develop está sincronizado com origin
git fetch origin develop --quiet
BEHIND="$(git rev-list --count HEAD..origin/develop 2>/dev/null || echo 0)"
if [[ "$BEHIND" -gt 0 ]]; then
    echo -e "${RED}Erro: develop está ${BEHIND} commit(s) atrás de origin/develop. Faça git pull antes.${RESET}" >&2
    exit 1
fi

# Garante que não há alterações em arquivos rastreados
if [[ -n "$(git status --porcelain | grep -v '^??')" ]]; then
    echo -e "${RED}Erro: há alterações não commitadas. Faça commit ou stash antes.${RESET}" >&2
    exit 1
fi

# ── calcula a versão candidata a partir da mesma lógica de bump do release.sh ──
if ! BASE_VERSION="$(./scripts/release.sh --print-next-version)"; then
    echo -e "${YELLOW}Nada a testar — nenhum commit novo desde a última release.${RESET}"
    exit 0
fi
RC_VERSION="${BASE_VERSION%-dev}-rc"

if [[ "$CLEANUP" == true ]]; then
    echo -e "${YELLOW}Removendo release candidate ${RC_VERSION}...${RESET}"
    gh release delete "$RC_VERSION" --cleanup-tag --yes 2>/dev/null \
        && echo -e "${GREEN}${RC_VERSION} removida.${RESET}" \
        || echo -e "${YELLOW}${RC_VERSION} não existia (nada a remover).${RESET}"
    exit 0
fi

if [[ "$DRY_RUN" == true ]]; then
    echo -e "${GREEN}[dry-run] criaria/atualizaria a tag ${CYAN}${RC_VERSION}${RESET}"
    exit 0
fi

# ── cria/sobrescreve a tag flutuante e envia (força) ───────────────────────────
COMMIT="$(git rev-parse --short HEAD)"
git tag -fa "$RC_VERSION" -m "Release candidate — base ${COMMIT}"
git push origin "$RC_VERSION" --force

echo -e "${GREEN}Tag ${RC_VERSION} enviada (base ${COMMIT}). GitHub Actions vai publicar/atualizar a pré-release.${RESET}"
echo ""
echo -e "  Acompanhe em: https://github.com/jacksonbicalho/os-camera/actions"
echo -e "  Binário:      https://github.com/jacksonbicalho/os-camera/releases/download/${RC_VERSION}/camera-linux-amd64"
echo -e "  Docker:       docker pull jacksonbicalho/os-camera:${RC_VERSION#v}"
