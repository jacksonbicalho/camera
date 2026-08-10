# internal/discovery

Descoberta de câmeras na rede local, usada pelo wizard de cadastro
(`GET /api/discover`, `POST /api/discover/streams`, admin). Roda ONVIF
WS-Discovery e uma varredura de porta 554 em paralelo, deduplicando por IP
(resultado ONVIF tem precedência sobre o achado só por porta).

## Arquivos principais
- `discovery.go` — `Discover(ctx)`: dispara os dois mecanismos abaixo em
  goroutines com timeout (`defaultTimeout`, 10s) e mescla os resultados.
- `onvif.go` — `discoverONVIF`: WS-Discovery via multicast UDP (probe SOAP
  padrão ONVIF), parseia as respostas (`parseProbeMatches`) e extrai um nome
  amigável das `Scopes` do dispositivo (`nameFromScopes`).
- `portscan.go` — `scanPort554`: varre a sub-rede local (`localSubnet`) atrás
  de qualquer host respondendo na porta 554 (RTSP) — pega câmeras sem suporte
  ONVIF que o WS-Discovery não veria.
- `media.go` — `GetStreamURIs`: depois que um dispositivo ONVIF é
  encontrado, consulta o serviço Media dele (SOAP com WS-Security,
  `wsSecurityHeader`) pra resolver as URLs RTSP reais dos perfis de stream —
  chamado sob demanda (`POST /api/discover/streams`) quando o usuário escolhe
  um resultado, não durante o `Discover` inicial.
- `result.go` — `Result` (IP, porta, se é ONVIF, nome, URLs RTSP resolvidas).

## Ver também
- [internal/capturer/rtsp](../capturer/rtsp/README.md) — o protocolo que as URLs descobertas aqui alimentam.
