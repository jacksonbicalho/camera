# syntax=docker/dockerfile:1

# Frontend: builda o dist no host de build (BUILDPLATFORM = sem emulação), reutilizado
# por todas as arquiteturas alvo.
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive
COPY frontend/ ./
RUN yarn build

# Desenvolvimento: imagem com live build (docker-compose camera-dev monta o código).
# bash/git/docker-cli/docker-cli-compose/github-cli: não usados pelo processo da app em si,
# mas permitem que este mesmo container sirva de devcontainer (.devcontainer/devcontainer.json
# anexa aqui) — reaproveita a imagem/container que já existe em vez de criar um isolado à parte.
# Usuário "dev" (sudo sem senha): o processo da app (CMD abaixo) continua rodando como root,
# igual sempre — só o devcontainer.json ("remoteUser": "dev") faz o VSCode/Claude Code
# executar terminais/extensões como esse usuário. Existe só porque a extensão Claude Code
# recusa `--dangerously-skip-permissions` quando roda como root/sudo; UID/GID reais são
# ajustados em runtime pelo Dev Containers CLI (updateRemoteUserUID), não fixados aqui.
# openssh-client: `origin` é `git@github.com:...` (SSH) — sem o binário `ssh`, git push/fetch
# falha ("cannot run ssh"). O agente já chega encaminhado do host via SSH_AUTH_SOCK (Remote
# Containers), só faltava o cliente para usá-lo.
FROM golang:1.25-alpine AS development
RUN apk add --no-cache ffmpeg nodejs yarn bash git docker-cli docker-cli-compose github-cli sudo openssh-client && \
    adduser -D -u 1000 -s /bin/bash dev && \
    echo "dev ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/dev && \
    chmod 0440 /etc/sudoers.d/dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY frontend/package.json frontend/yarn.lock ./frontend/
RUN cd frontend && yarn install --frozen-lockfile --non-interactive
RUN chown -R dev:dev /go /app
CMD ["go", "run", "./cmd/camera"]

# Builder: roda no host de build (BUILDPLATFORM) e CROSS-compila para a arch alvo do
# buildx (TARGETARCH/TARGETVARIANT). Binário Go estático (CGO desligado).
FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS builder
ARG VERSION=dev
ARG TARGETARCH
ARG TARGETVARIANT
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/frontend/dist ./frontend/dist
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} \
    sh -c 'BUILDMODE="-buildmode=pie"; \
           if [ "$TARGETARCH" = "arm" ]; then GOARM=7; export GOARM; BUILDMODE=""; fi; \
           go build $BUILDMODE -ldflags="-s -w -X main.version=${VERSION}" -o camera ./cmd/camera'

# Produção: imagem mínima da arch alvo, só com ffmpeg + o binário.
FROM alpine:3.20 AS production
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY --from=builder /app/camera .
CMD ["./camera", "--config", "/app/camera.yaml"]

# E2E builder: compila o binário do servidor e o do seed de fixture (e2e/seed)
# nativos (sem cross-compile — o harness roda na mesma arch em que buildou),
# com o frontend já embutido.
FROM golang:1.25-alpine AS e2e-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/frontend/dist ./frontend/dist
RUN CGO_ENABLED=0 go build -o /out/camera ./cmd/camera && \
    CGO_ENABLED=0 go build -o /out/seed ./e2e/seed

# E2E: imagem auto-contida que semeia o fixture determinístico e sobe o
# servidor já apontado pra ele — usada por e2e/docker-compose.yml (serviço
# `camera`). `curl` é só para o healthcheck do compose.
FROM alpine:3.20 AS e2e
RUN apk add --no-cache ffmpeg curl
WORKDIR /app
COPY --from=e2e-builder /out/camera /out/seed ./
COPY e2e/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
ENTRYPOINT ["./docker-entrypoint.sh"]
