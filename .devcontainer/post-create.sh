#!/usr/bin/env bash
# Roda uma vez, na criação do container. Não autentica nada sozinho —
# credenciais isoladas do host exigem um passo manual (ver mensagem abaixo).
set -uo pipefail

git config --global --add safe.directory /workspaces/os-camera

# Volumes Docker nomeados são criados como root:root na primeira montagem
# (o path não existe na imagem) — sem isso, go build/gh auth falham como vscode.
sudo chown -R vscode:vscode /home/vscode/.cache/go-build /home/vscode/.config/gh

if ! gh auth status >/dev/null 2>&1; then
    cat <<'EOF'

⚠️  Container sem credencial do GitHub (isolado do host de propósito).
Rode uma vez, dentro deste container:

    gh auth login          # autentica com uma conta/token dedicado ao container
    gh auth setup-git      # git passa a usar o gh como credential helper (HTTPS)
    git remote set-url origin https://github.com/jacksonbicalho/os-camera.git

Sem isso, scripts/push-pr.sh e demais scripts que chamam `gh`/`git push` vão falhar.
EOF
fi
