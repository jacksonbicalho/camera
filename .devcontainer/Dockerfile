# syntax=docker/dockerfile:1
# Imagem do dev container isolado do host: Go + Node (copiado da imagem oficial,
# sem depender do apt/nodesource) + ffmpeg. docker CLI e gh CLI entram via
# "features" no devcontainer.json (não aqui), que já cuidam de usuário/grupo.

FROM node:20-bookworm AS node

FROM golang:1.25-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        git \
        openssh-client \
        ca-certificates \
        sudo \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && npm install -g yarn

ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=$USER_UID
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m -s /bin/bash $USERNAME \
    && echo "$USERNAME ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME

ENV GOCACHE=/home/$USERNAME/.cache/go-build
