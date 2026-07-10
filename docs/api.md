# API HTTP

O `os-camera` expõe toda a sua funcionalidade por uma API REST — a própria SPA não
usa nenhum canal privilegiado. Qualquer app externo (script, integração, painel,
automação residencial) consegue fazer tudo que a interface faz.

- **Contrato completo:** [`api/openapi.yaml`](../api/openapi.yaml) — OpenAPI 3.1, com
  todos os endpoints, parâmetros, schemas e códigos de status.
- **Este guia:** o "como" — autenticação, papéis, streams, armadilhas e exemplos.

> A spec não envelhece: um teste (`internal/server/openapi_test.go`) compara cada
> operação do `openapi.yaml` com a tabela de rotas do servidor
> (`internal/server/routes.go`) e **quebra o build** se um endpoint for adicionado,
> removido ou tiver o nível de acesso alterado sem atualizar a documentação.

---

## Autenticação

### Login

`POST /api/auth/login` recebe `username` (que aceita **username ou e-mail**) e
`password`, e devolve um JWT válido por **24 horas**.

```bash
curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"senha"}'
# {"token":"eyJhbGciOiJIUzI1NiIs..."}
```

### Enviando o token

Duas formas, ambas aceitas em qualquer endpoint protegido:

```bash
# Preferida: header
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/cameras

# Query param: para clientes que não conseguem definir headers
#   <video src>, EventSource (SSE), <img src>
curl "http://localhost:8080/api/cameras?token=$TOKEN"
```

### CORS

Todas as rotas `/api/*` respondem com `Access-Control-Allow-Origin: *` (e tratam o
preflight `OPTIONS`), então um app hospedado em qualquer outro origin (ex.: um PWA
servido à parte do servidor `os-camera`) consegue chamar `fetch`/`XHR` normalmente.
Isso é seguro porque a autenticação é sempre bearer token explícito — nunca cookie
— então não há superfície de CSRF: um site de terceiros não tem como anexar
automaticamente o token do usuário numa requisição forjada. `/stream/`,
`/recordings/` e a SPA não têm CORS (não precisam — são consumidos same-origin
pelo frontend embutido).

### ⚠️ Tokens em apps externos

**O segredo que assina o JWT é gerado aleatoriamente a cada boot do servidor.** Sem
configuração, todo token emitido é invalidado quando o processo reinicia — inclusive
o do seu app, no meio da madrugada, depois de um `docker restart`.

Para um app externo, **fixe o segredo** antes de qualquer outra coisa:

```bash
# variável de ambiente (sobrescreve server.jwt_secret do camera.yaml)
OS_CAMERA_JWT_SECRET="<algo longo e aleatório>"
```

Com o segredo fixo, um token sobrevive a reinicializações — mas ainda **expira em
24h**. Um cliente bem-comportado trata `401` como "reautentique e repita", não como
erro fatal:

```python
def request(method, path, **kw):
    r = session.request(method, BASE + path, **kw)
    if r.status_code == 401:
        session.headers["Authorization"] = f"Bearer {login()}"
        r = session.request(method, BASE + path, **kw)
    return r
```

Não existe ainda API key de longa duração — o JWT com expiração é o único
mecanismo. Guarde as credenciais, não o token.

### Primeiro acesso

O admin inicial nasce com `must_change_password=true`. Enquanto essa flag estiver
no token, **todos os endpoints respondem `403 password change required`**, exceto
`POST /api/auth/change-password`. Um app que se autentica com um usuário recém-criado
precisa tratar esse caso — ou usar um usuário que já trocou a senha.

### Recuperação de senha

`POST /api/auth/forgot-password` responde **sempre `200`**, exista o e-mail ou não
(não vaza quem está cadastrado). Sem SMTP configurado, é um no-op silencioso.
`POST /api/auth/reset-password` consome o token do e-mail (válido por 30 min).

---

## Papéis e acesso

Cada operação da spec declara a extensão `x-auth`, que espelha exatamente o
middleware aplicado pelo servidor:

| `x-auth` | Quem passa |
|---|---|
| `public` | qualquer um, sem token |
| `change-password` | token válido, mesmo com `must_change_password=true` |
| `full` | token válido, senha já trocada |
| `admin` | `full` + `role=admin` |
| `camera` | token válido + acesso à câmera do path |

Há dois papéis: **`admin`** (acessa tudo, todas as câmeras) e **`viewer`** (só as
câmeras concedidas a ele). Endpoints `camera` filtram por essa concessão; um viewer
sem acesso recebe `403`, não `404` — ele não descobre que a câmera existe.

Note que `camera` **não** exige a troca de senha feita. Se isso importa para o seu
app, cheque o claim `must_change_password` no JWT.

---

## Erros

Erros são **`text/plain`**, não JSON. O corpo é uma frase curta (`unauthorized`,
`invalid body`, `forbidden`, `webrtc unavailable for this camera`).

**Programe contra o status, nunca contra o texto** — a frase pode mudar; o status é
o contrato.

| Status | Significado |
|---|---|
| `400` | corpo ou parâmetro malformado |
| `401` | token ausente, inválido ou expirado → reautentique |
| `403` | papel insuficiente, sem acesso à câmera, ou troca de senha pendente |
| `404` | recurso inexistente |
| `409` | WebRTC indisponível para a câmera → use HLS (ver abaixo) |
| `503` | dependência indisponível (banco, ffmpeg) |

---

## Câmeras, gravações e eventos

```bash
# câmeras acessíveis ao usuário
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/cameras

# gravações de uma câmera num dia
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/cameras/entrada/recordings?date=2026-07-09"

# eventos de movimento do dia
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/cameras/entrada/motion?date=2026-07-09&limit=50"

# snapshot JPEG atual
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/cameras/entrada/snapshot -o agora.jpg
```

### Só os dias que têm conteúdo

Antes de varrer um calendário dia a dia, pergunte quais têm conteúdo —
`kind` aceita `recordings`, `events` ou `all`:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/cameras/entrada/content-days?kind=events"
# {"days":["2026-07-07","2026-07-09"]}
```

O agregado multi-câmera é `GET /api/content-days?cameras=entrada,quintal`.

### Momentos: a visão unificada

`GET /api/moments` agrega, multi-câmera, tudo que "aconteceu" — movimento, pessoa,
detecções de IA e transições de estado — já ordenado no tempo, com o frame de cada
um. É o endpoint certo para um feed de atividade; poupa correlacionar quatro fontes
na mão.

### Baixando os arquivos

Gravações e frames são servidos por um handler de arquivos sob `/recordings/`, com
suporte a `Range` (seek). O caminho vem no campo `url` de cada gravação:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/recordings/entrada/2026/07/09/20260709143000.mp4" -o clip.mp4
```

---

## Tempo real (SSE)

Cinco endpoints entregam `text/event-stream`. Como `EventSource` não define headers,
**use `?token=`**:

| Endpoint | Entrega |
|---|---|
| `GET /api/cameras/{id}/motion/live` | eventos de movimento da câmera |
| `GET /api/motion/live` | eventos de todas as câmeras acessíveis |
| `GET /api/cameras/{id}/motion/scores` | score bruto de cada frame de diff |
| `GET /api/cameras/{id}/motion/region-score` | score por zona/região |
| `GET /api/notifications/live` | notificações do usuário |

```javascript
const es = new EventSource(`/api/cameras/entrada/motion/live?token=${token}`)
es.onmessage = (e) => console.log(JSON.parse(e.data))
```

```bash
curl -N "http://localhost:8080/api/motion/live?token=$TOKEN"
```

---

## Ao vivo: WebRTC com fallback HLS

O ao-vivo tem dois transportes. **WebRTC** entrega latência sub-segundo; **HLS** tem
piso de ~5–6 s, mas funciona em qualquer câmera.

Negocie o WebRTC com um handshake WHEP-style: mande a offer SDP, receba a answer.
O ICE é reunido por completo antes da resposta (sem trickle).

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"sdp":"v=0\r\no=- ..."}' \
  http://localhost:8080/api/cameras/entrada/webrtc
# {"sdp":"v=0\r\no=- ..."}
```

**`409` não é um erro do seu cliente** — é o servidor dizendo que essa câmera não
publica via WebRTC (não é H.264, ou está configurada como `live_transport=hls`).
A resposta correta é cair para o HLS, exatamente como a SPA faz:

```
GET /stream/{camera_id}/index.m3u8?token=<token>
```

A playlist vai com `Cache-Control: no-cache`; os segmentos `.ts` têm nomes imutáveis
e são cacheáveis. Câmeras com `hls_dvr_seconds > 0` mantêm a janela DVR inteira e
incluem `EXT-X-PROGRAM-DATE-TIME`, o que permite seek por timestamp.

O campo `live_transport` de cada câmera (`auto` | `webrtc` | `hls`) determina o que
existe: `auto` sobe os dois pipelines, `webrtc` **não gera segmentos HLS** (o
fallback não existe), `hls` não publica WebRTC.

---

## Exemplo ponta a ponta

Baixar o snapshot de todas as câmeras que tiveram movimento hoje:

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE=http://localhost:8080

TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"'"$SENHA"'"}' | jq -r .token)

HOJE=$(date +%F)

curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/cameras" \
  | jq -r '.[].id' \
  | while read -r cam; do
      dias=$(curl -s -H "Authorization: Bearer $TOKEN" \
        "$BASE/api/cameras/$cam/content-days?kind=events" | jq -r '.days[]')
      if grep -qx "$HOJE" <<<"$dias"; then
        curl -s -H "Authorization: Bearer $TOKEN" \
          "$BASE/api/cameras/$cam/snapshot" -o "$cam.jpg"
        echo "$cam: movimento hoje, snapshot salvo"
      fi
    done
```

---

## Gerando um cliente

Como o contrato é OpenAPI 3.1 válido, dá para gerar um cliente tipado em vez de
escrever requisições à mão:

```bash
# TypeScript (tipos)
npx openapi-typescript api/openapi.yaml -o client.d.ts

# Python, Go, etc.
openapi-generator-cli generate -i api/openapi.yaml -g python -o ./client
```

Os endpoints cuja resposta é `additionalProperties: true` na spec (configuração,
relatórios, discover) são objetos abertos de propósito: o shape depende da
configuração da instalação e não é estável o bastante para virar tipo.
