# Histórico

O **Histórico** (`/history/:cameraId`, aba ao lado de "Ao vivo" no topo da página da
câmera) mostra as gravações do dia selecionado, com um player e uma tira de cards pra
trocar de gravação.

## Navegação

- **Calendário** (canto superior direito da tira de gravações) — escolhe o dia; só dias
  com gravação ou evento ficam habilitados.
- **Tira de cards** — uma gravação por chunk do dia, mais recente primeiro. Cada card
  mostra a duração e uma cor de borda pela categoria predominante daquele chunk (azul =
  contínua, sem evento; amarelo = movimento; vermelho = pessoa; roxo = IA; verde =
  transição de estado). Clicar num card toca aquela gravação.
- **Carregar mais** — pagina gravações mais antigas do mesmo dia sob demanda.
- **URL compartilhável** — `/history/:cameraId/:recordingId` pré-seleciona a gravação; a
  barra de endereço acompanha sozinha qual gravação está tocando.

## Reprodução contínua

O toggle **Reprodução contínua** (ao lado do contador "Gravações · N") encadeia as
gravações do dia uma atrás da outra, com a mesma transição sem tela preta que existe entre
os chunks de um clipe de evento (double-buffering — dois `<video>` empilhados, o próximo
pré-carrega enquanto o atual toca).

- Liga a partir da gravação selecionada (ou a que estiver tocando no momento), encadeando
  em direção às gravações **mais recentes** — ex.: com o toggle ligado e um clique no 3º
  card mais recente, a reprodução segue "3ª, 2ª, 1ª (mais nova)".
- Clicar em outro card **enquanto o modo está ligado** re-ancora a sequência nele, sem
  desligar o modo.
- Trocar de dia ou desligar o toggle volta pro clipe único da gravação que estiver tocando
  no momento.
- Não carrega páginas mais antigas automaticamente ao alcançar o fim do que já está na
  tela (mesmo critério do "Carregar mais" manual).

## Controles do player

Barra de controles própria (não os controles nativos do `<video>`): play/pause, repetir,
mudo, **velocidade de reprodução** (dropdown 1×–32× — filtra automaticamente as opções que
o navegador não suporta de verdade) e tela cheia, além do zoom digital (arrastar/scroll)
já comum às outras telas de vídeo. O contador "N / M" de segmento (usado na reprodução de
um clipe de evento, `/recording/:cameraId/:recordingId`) não aparece aqui — no Histórico,
cada card da tira é uma gravação distinta, não um recorte de uma mesma gravação.
