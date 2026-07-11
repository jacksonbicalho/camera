# os-camera PWA

Cliente PWA simples para acompanhar as câmeras do `os-camera` pelo celular —
login + grid de câmeras com snapshot atualizado por polling + view ampliada
por câmera. Instalável na tela inicial (`manifest.json` + service worker).

É um cliente **externo** da API já documentada em `../api/openapi.yaml`
(mesmo contrato usado pelo `frontend/`), independente do resto do repo:
**vanilla HTML/CSS/JS, sem bundler, sem dependências**. Basta servir os
arquivos estáticos deste diretório.

## Servir

Qualquer static file server funciona, por exemplo:

```bash
cd pwa
python3 -m http.server 8000
```

Abra `http://localhost:8000` (ou o IP da máquina, na rede local, pelo
celular) e informe o endereço do servidor `os-camera` na tela de login (ex.
`http://192.168.1.10:8080`) — pode ser um origin completamente diferente do
que serve o `pwa/`: o backend responde CORS liberado em `/api/*` (ver
"CORS" em [`docs/api.md`](../docs/api.md)), então o PWA funciona hospedado
em qualquer lugar, inclusive um domínio/porta diferente do servidor.

## Instalar no celular

Com o app aberto no navegador do celular (Chrome/Android ou Safari/iOS),
use o menu do navegador → "Adicionar à tela inicial" / "Instalar app". O
`manifest.json` + o service worker (`sw.js`, cacheia só o shell — HTML/CSS/
JS/ícone; nunca a API ou os snapshots) habilitam o modo `standalone` (tela
cheia, sem barra de endereço).

## Escopo desta primeira versão

- Login (usuário/senha) contra o servidor informado na tela inicial.
- Barra de abas persistente: **Câmeras** / **Histórico** / **Notif.** /
  **Ajustes**.
- **Câmeras** — grid de câmeras com snapshot em polling (a cada 3s) — não é
  vídeo ao vivo de verdade (WebRTC/HLS), é a forma mais simples de funcionar
  em qualquer navegador mobile sem codec/streaming envolvido. Tocar num card
  abre a tela **Ao vivo**: mesmo polling, só que mais rápido (a cada 1s),
  com "Snapshot" (baixa o frame atual) e "Tela cheia" (Fullscreen API).
- **Histórico** — seletor de câmera + calendário do mês (dias com conteúdo
  via `GET /api/cameras/{id}/content-days?kind=events`) + linha do tempo do
  dia selecionado (`GET /api/cameras/{id}/motion?date=`).
- **Notificações** — feed de hoje via `GET /api/moments?date=` (thumbnail,
  câmera, label, tempo relativo, score). Cada item abre a gravação (chunk
  MP4) que contém aquele instante (`GET /api/cameras/{id}/recordings` do
  mesmo dia + a última que começou antes do instante) numa tela de player
  própria (`<video controls muted autoplay>`, sem motor de player próprio —
  reprodução nativa do navegador).
- **Ajustes** — endereço do servidor (leitura) + Sair.
- Troca de senha obrigatória (`must_change_password`) não é tratada aqui —
  o app pede pra trocar pelo `frontend/` web.
- **Fora de escopo**: vídeo ao vivo real (WebRTC/HLS), score de movimento em
  tempo real (SSE) na tela Ao vivo, múltiplos dias agregados na tela
  Notificações (só hoje).

## Testes

Lógica pura (calendário, tempo relativo/URL de thumbnail, chamadas de API)
fica em módulos `.js` separados da manipulação de DOM (`js/calendar.js`,
`js/format.js`, `js/api.js`) e é testada com `node:test` (nativo do Node,
zero dependência nova). Os arquivos `js/*.test.js` rodam via Docker, sem
precisar instalar nada:

```bash
docker run --rm -v "$(pwd)/pwa":/app -w /app node:20-alpine node --test js
```
