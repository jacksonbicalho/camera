#!/bin/sh
# postCreateCommand do devcontainer (roda como root via sudo, 1x por criação do
# container). O usuário "dev" (ver Dockerfile, stage development) precisa falar
# com /var/run/docker.sock (montado do host) para scripts/check.sh e afins, mas
# o GID do grupo dono do socket varia por host — não dá pra fixar no Dockerfile.
# Cria (se preciso) um grupo com esse GID e adiciona "dev" a ele.
set -e

DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)
DOCKER_GROUP=$(awk -F: -v gid="$DOCKER_GID" '$3 == gid { print $1; exit }' /etc/group)

if [ -z "$DOCKER_GROUP" ]; then
  DOCKER_GROUP=docker-host
  addgroup -g "$DOCKER_GID" "$DOCKER_GROUP"
fi

if ! id -nG dev | tr ' ' '\n' | grep -qx "$DOCKER_GROUP"; then
  addgroup dev "$DOCKER_GROUP"
fi
