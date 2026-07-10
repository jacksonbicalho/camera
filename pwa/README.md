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
- Grid de câmeras com snapshot em polling (a cada 3s) — não é vídeo ao vivo
  de verdade (WebRTC/HLS), é a forma mais simples de funcionar em qualquer
  navegador mobile sem codec/streaming envolvido.
- View ampliada por câmera com polling mais rápido (a cada 1s).
- Troca de senha obrigatória (`must_change_password`) não é tratada aqui —
  o app pede pra trocar pelo `frontend/` web.
