// timelineScale — funções puras de mapeamento tempo↔posição pro HistoryTimeline.
// Adaptado do timelineScale.ts original (removido junto com a antiga CameraPage) —
// só a parte pura sobrevive aqui; o resto (janelas de zoom, filmstrip permanente) não é
// necessário no desenho atual (régua fixa de 24h, sem seletor de janela).

export interface TimelineWindow {
  startMs: number
  endMs: number
}

// Fração 0..1 da posição de um timestamp dentro da janela (clampada).
export function timePosFraction(tsMs: number, win: TimelineWindow): number {
  const span = win.endMs - win.startMs
  if (span <= 0) return 0
  const f = (tsMs - win.startMs) / span
  return f < 0 ? 0 : f > 1 ? 1 : f
}

// Inverso de timePosFraction: fração 0..1 → timestamp (ms) na janela.
export function posToTime(fraction: number, win: TimelineWindow): number {
  const f = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction
  return win.startMs + f * (win.endMs - win.startMs)
}

// Item (gravação) cujo intervalo [start, start+chunkMs) cobre o instante `ms`; sem
// cobertura exata, devolve o item cujo início está mais próximo de `ms` (antes ou
// depois) — sempre um resultado útil pro preview/seleção, em vez de "nada" numa lacuna.
// Não devolve offsetSeconds (diferente do original): a seleção aqui é sempre a
// gravação inteira (mesma granularidade de clicar um card da lista), não um instante
// preciso dentro dela.
export function recordingAtMs<T extends { rec: { start: string } }>(
  items: T[],
  ms: number,
  chunkMs: number,
): T | null {
  let best: T | null = null
  let bestDist = Infinity
  for (const item of items) {
    const startMs = Date.parse(item.rec.start)
    if (Number.isNaN(startMs)) continue
    if (ms >= startMs && ms < startMs + chunkMs) return item
    const dist = Math.abs(ms - startMs)
    if (dist < bestDist) {
      bestDist = dist
      best = item
    }
  }
  return best
}

// Empurra posições (fração 0..1) muito próximas umas das outras pra garantir uma
// separação mínima visível — sem isso, gravações muito próximas no tempo (ex.:
// reconexões rápidas do gravador gerando vários chunks curtos em segundos) colapsam
// no mesmo pixel/percentual e "somem" visualmente, mesmo a posição calculada estando
// correta (`HistoryTimeline`, uma linha vertical por gravação DENTRO da hora). Ordena
// por posição e empurra pra frente só quando necessário — nunca inverte a ordem
// cronológica, e a entrada mais cedo nunca muda de posição; entradas já espaçadas o
// bastante mantêm a posição proporcional exata (sem distorção pro caso comum).
export function spreadFractions<T extends { id: number; frac: number }>(
  entries: T[],
  minGap: number,
): Map<number, number> {
  const sorted = [...entries].sort((a, b) => a.frac - b.frac)
  // Passo 1 (frente pra trás): empurra cada posição pra garantir `minGap` da anterior —
  // nunca decresce abaixo da fração original, só avança quando necessário. Pode
  // ultrapassar 1 quando um cluster inteiro está perto do fim da hora.
  const forward: number[] = []
  let prev = -Infinity
  for (const entry of sorted) {
    const pos = Math.max(entry.frac, prev + minGap)
    forward.push(pos)
    prev = pos
  }
  // Passo 2 (trás pra frente): um clamp simples em 1 no passo 1 faria VÁRIAS posições
  // colidirem exatamente em 1 quando o cluster estoura — reintroduzindo o mesmo colapso
  // visual que esta função existe pra evitar, só deslocado pra borda direita da hora.
  // Reconcilia de trás pra frente, garantindo `minGap` também contra a posição seguinte
  // já resolvida — a posição final pode ficar abaixo da fração original quando o
  // cluster não cabe inteiro. Garantia de distinção NÃO é incondicional: só vale até
  // `entries.length <= 1/minGap + 1` — o `minGap` efetivo é DINÂMICO (calculado em
  // `HistoryTimeline.tsx` a partir da largura real do bloco de hora, ver
  // `LINE_GAP_PX`), então esse teto varia com o layout: ~21 itens numa hora larga
  // (minGap baixo, ~5%) mas só ~4 numa hora bem estreita (minGap no teto de 30%) —
  // acima do teto, o [0,1] não comporta mais posições com essa separação mínima e o
  // excedente colide em 0. Na prática o próprio orçamento de pixels do bloco (largura
  // real / 1px por traço) já limita quantos traços cabem legíveis antes desse teto
  // algorítmico entrar em jogo.
  const result = new Map<number, number>()
  let next = Infinity
  for (let i = sorted.length - 1; i >= 0; i--) {
    const pos = Math.max(0, Math.min(forward[i], next - minGap, 1))
    result.set(sorted[i].id, pos)
    next = pos
  }
  return result
}

// Largura (px) de UM card de hora — proporcional à quantidade de gravações naquela hora
// (medidas do protótipo de referência, TimelineHour.tsx, descartado como código): as
// linhas ocupam `lineWidthPx` cada, separadas por `lineGapPx`, mais um `paddingPx` lateral
// fixo; `minWidthPx` é o piso pra horas vazias ou com poucas gravações (o card nunca fica
// menor que isso, mesmo sem nenhuma linha). Parametrizada (não usa constantes fixas
// internas) pelo mesmo motivo de `spreadFractions` acima — o chamador é quem decide os
// valores, aqui só a fórmula.
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
  /** offsets[h] = posição x (px), a partir do início do conteúdo, onde o card da hora h
   * começa (já soma as larguras + gaps de todas as horas anteriores). */
  offsets: number[]
  /** Largura total do conteúdo (soma de todos os cards + gaps entre eles). */
  totalWidthPx: number
}

// computeHourLayout converte uma largura (px) por hora (`hourWidthsPx`, uma por hora do
// dia) numa lista de offsets — necessário porque, com cards de largura PROPORCIONAL à
// contagem (não mais uniforme), a posição x de cada hora não é mais `hora * largura fixa`.
export function computeHourLayout(hourWidthsPx: number[], gapPx: number): HourLayout {
  const offsets: number[] = []
  let x = 0
  for (const w of hourWidthsPx) {
    offsets.push(x)
    x += w + gapPx
  }
  return { offsets, totalWidthPx: hourWidthsPx.length > 0 ? x - gapPx : 0 }
}

// timeFractionToPixel converte uma fração 0..1 do DIA INTEIRO pra uma posição x (px) no
// conteúdo — piecewise linear entre as horas (que podem ter larguras DIFERENTES entre si,
// proporcionais à contagem de gravações de cada uma via `hourBoxWidthPx`): uma conta simples
// `fração * larguraTotal` desalinharia a alça/preview dos cards de verdade sempre que as
// larguras divergissem da média (ex.: a alça "atravessaria" uma hora estreita rápido
// demais, ou uma larga devagar demais, em vez de seguir exatamente a borda de cada card).
export function timeFractionToPixel(
  fraction: number,
  hourWidthsPx: number[],
  layout: HourLayout,
): number {
  const n = hourWidthsPx.length
  if (n === 0) return 0
  const clamped = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction
  const hoursFromStart = clamped * n
  const hour = Math.min(n - 1, Math.floor(hoursFromStart))
  const fracWithinHour = Math.min(1, Math.max(0, hoursFromStart - hour))
  return layout.offsets[hour] + fracWithinHour * hourWidthsPx[hour]
}

// pixelToTimeFraction é o inverso de `timeFractionToPixel` — dado um x (px) dentro do
// conteúdo, acha em qual card de hora ele cai e devolve a fração 0..1 do dia
// correspondente. Um x que cai exatamente num GAP entre dois cards (área sem card
// nenhum) é atribuído ao card ANTERIOR, no seu limite direito (fracWithinHour clampada em
// 1) — os gaps são pequenos o bastante (`CARD_GAP_PX` em HistoryTimeline.tsx) pra essa
// escolha não ser perceptível.
export function pixelToTimeFraction(
  pixelX: number,
  hourWidthsPx: number[],
  layout: HourLayout,
): number {
  const n = hourWidthsPx.length
  if (n === 0 || pixelX <= 0) return 0
  for (let hour = 0; hour < n; hour++) {
    const start = layout.offsets[hour]
    const width = hourWidthsPx[hour]
    const isLast = hour === n - 1
    const nextStart = isLast ? start + width : layout.offsets[hour + 1]
    if (pixelX < nextStart || isLast) {
      const fracWithinHour = width > 0 ? Math.min(1, Math.max(0, (pixelX - start) / width)) : 0
      return Math.min(1, (hour + fracWithinHour) / n)
    }
  }
  return 1
}

// true sse `ms` cai dentro de [start, start+chunkMs) de ALGUMA gravação — diferente de
// `recordingAtMs`, que sempre acha "a mais próxima" mesmo numa lacuna sem gravação
// nenhuma. Usado pra decidir se o preview (imagem) deve aparecer: sem cobertura real,
// mostrar uma miniatura da gravação mais próxima seria enganoso (parece que tem vídeo
// ali, mas não tem).
export function isCoveredByRecording<T extends { rec: { start: string } }>(
  items: T[],
  ms: number,
  chunkMs: number,
): boolean {
  return items.some((item) => {
    const startMs = Date.parse(item.rec.start)
    return !Number.isNaN(startMs) && ms >= startMs && ms < startMs + chunkMs
  })
}
