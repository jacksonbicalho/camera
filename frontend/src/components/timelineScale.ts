// timelineScale — funções puras de layout/posição pro HistoryTimeline. Modelo 100%
// geométrico (pixel/índice de card), sem noção de "fração do dia" — desde que os cards de
// hora passaram a ter largura PROPORCIONAL à contagem (e horas vazias somem do layout),
// a única fonte de verdade pra "onde fica o quê" é a lista de cards de fato renderizados,
// não mais uma janela de tempo abstrata.

// Distribui N ids uniformemente em [0,1] pela ORDEM (índice), não pelo horário real de cada
// um — o 1º (mais cedo) → 0, o último (mais tarde) → 1, os do meio em passos iguais entre
// eles. Substituiu uma versão anterior baseada em fração de horário real (com um "empurrão"
// de separação mínima pra gravações muito próximas no tempo): naquele modelo, a LARGURA do
// card já é dimensionada só pela CONTAGEM (não pela duração real coberta pelas gravações,
// ver `hourBoxWidthPx`) — misturar isso com posição por TEMPO real produzia um artefato
// visual (relatado pelo navigator): um agrupamento denso de gravações num intervalo curto
// era empurrado pra ocupar mais espaço do que sua fração de tempo real "merecia", abrindo um
// vão visualmente estranho onde as gravações seguintes eram naturalmente mais espaçadas.
// Como a largura do card já não reflete duração, posicionar por ÍNDICE (não por tempo) é
// consistente com esse design e elimina o artefato por construção — o espaçamento entre
// quaisquer duas linhas vizinhas é sempre exatamente igual, nunca menos que o mínimo
// necessário (`hourBoxWidthPx` dimensiona o card exatamente para isso). `ids` deve já vir
// ordenado cronologicamente pelo chamador — esta função só distribui posições, não ordena.
export function evenFractions(ids: number[]): Map<number, number> {
  const result = new Map<number, number>()
  const last = ids.length - 1
  ids.forEach((id, i) => result.set(id, last > 0 ? i / last : 0))
  return result
}

// Largura (px) de UM card de hora — proporcional à quantidade de gravações naquela hora
// (medidas do protótipo de referência, TimelineHour.tsx, descartado como código): as
// linhas ocupam `lineWidthPx` cada, separadas por `lineGapPx`, mais um `paddingPx` lateral
// fixo; `minWidthPx` é o piso pra horas com poucas gravações. Parametrizada (não usa
// constantes fixas internas) — o chamador é quem decide os valores, aqui só a fórmula.
export function hourBoxWidthPx(
  count: number,
  lineWidthPx: number,
  lineGapPx: number,
  paddingPx: number,
  minWidthPx: number,
): number {
  const content = count * lineWidthPx + Math.max(0, count - 1) * lineGapPx
  return Math.max(content + paddingPx, minWidthPx)
}

export interface HourLayout {
  /** offsets[i] = posição x (px), a partir do início do conteúdo, onde o card no índice i
   * (da lista COMPACTA de cards renderizados — horas sem gravação nenhuma não entram
   * nessa lista) começa. */
  offsets: number[]
  /** Largura total do conteúdo (soma de todos os cards + gaps entre eles). */
  totalWidthPx: number
}

// computeHourLayout converte uma largura (px) por card numa lista de offsets acumulados.
export function computeHourLayout(widthsPx: number[], gapPx: number): HourLayout {
  const offsets: number[] = []
  let x = 0
  for (const w of widthsPx) {
    offsets.push(x)
    x += w + gapPx
  }
  return { offsets, totalWidthPx: widthsPx.length > 0 ? x - gapPx : 0 }
}

// cardIndexAtPixel acha em qual card (índice na lista COMPACTA `widthsPx`/`layout`) um
// pixel `pixelX` cai — ESTRITO: só dentro dos limites [início, fim) do próprio card,
// nunca nos gaps entre eles nem além das bordas. `null` quando o pixel não cai em NENHUM
// card (incluindo lista vazia) — pedido do navigator: a ação do mouse/ponteiro (hover,
// preview, clique) só deve responder quando está literalmente sobre um card, os gaps
// entre cards (e qualquer área além do último) são "mortos" pra interação.
export function cardIndexAtPixel(
  pixelX: number,
  widthsPx: number[],
  layout: HourLayout,
): number | null {
  for (let i = 0; i < widthsPx.length; i++) {
    const start = layout.offsets[i]
    const end = start + widthsPx[i]
    if (pixelX >= start && pixelX < end) return i
  }
  return null
}

// nearestIdByPixel acha, entre um conjunto de (id → posição em pixel), o id cuja posição
// está mais próxima de `pixelX` — usado pra resolver clique/arraste na trilha pra
// EXATAMENTE a linha visualmente mais próxima do ponto clicado (posições RENDERIZADAS, via
// `evenFractions`), não o horário bruto da gravação. Diferença crucial numa hora muito
// cheia: duas gravações com poucos segundos de diferença têm horários quase idênticos, mas
// a posição renderizada de cada uma é bem separada da vizinha (espaçamento sempre uniforme
// por índice) — resolver por horário bruto podia então "grudar" na gravação vizinha errada
// quando o usuário clicava exatamente em cima de uma linha específica (bug relatado pelo
// navigator). `positions` vazio devolve `null`.
export function nearestIdByPixel(positions: Map<number, number>, pixelX: number): number | null {
  let best: number | null = null
  let bestDist = Infinity
  for (const [id, pos] of positions) {
    const dist = Math.abs(pos - pixelX)
    if (dist < bestDist) {
      bestDist = dist
      best = id
    }
  }
  return best
}
