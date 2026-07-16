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
  // `entries.length <= 1/minGap + 1` (~21 pra minGap=0.05) — acima disso, o [0,1] não
  // comporta mais posições com essa separação mínima e o excedente colide em 0. Na
  // prática um bloco de hora (~30-40px) já não comportaria mais que ~20-25 traços de
  // 1px legíveis de qualquer forma, então esse teto raramente é alcançado antes do
  // limite físico de pixels.
  const result = new Map<number, number>()
  let next = Infinity
  for (let i = sorted.length - 1; i >= 0; i--) {
    const pos = Math.max(0, Math.min(forward[i], next - minGap, 1))
    result.set(sorted[i].id, pos)
    next = pos
  }
  return result
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
