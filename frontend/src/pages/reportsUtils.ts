import { eventCategory, type EventCategory } from './eventCategory'

export interface EventReport {
  total: number
  by_day: { day: string; count: number; by_category?: Record<string, number> }[]
  // preenchido só no modo "dia" (bucket=hour): 24 buckets 0..23
  by_hour?: { hour: number; count: number; by_category?: Record<string, number> }[]
  by_label: Record<string, number>
  // estados (e futuras categorias não derivadas de label) já vêm bucketizadas do backend
  by_category?: Record<string, number>
  // preenchido só no bucket=heatmap: uma célula por (dia, hora) para cada dia do período
  // (mapa de atividade dia × hora); date no formato YYYY-MM-DD
  heatmap?: { date: string; hour: number; count: number }[]
}

export interface CategoryDetail {
  total: number
  labels: { label: string; count: number }[]
}

// categoryDetail devolve o total e o detalhamento por label de uma categoria, para o
// modal: qualquer categoria `estados:*` (composta por classificador+estado) vem de
// `byCategory` — já é o grão mais fino possível, sem detalhamento por label; as demais
// somam os labels que caem na categoria (mesma regra do eventCategory), listando-os por
// contagem desc (o label vazio — base do `movimento` — não vira linha de detalhe).
export function categoryDetail(
  cat: EventCategory,
  byLabel: Record<string, number>,
  byCategory?: Record<string, number>,
): CategoryDetail {
  if (cat === 'estados' || cat.startsWith('estados:')) {
    return { total: byCategory?.[cat] ?? 0, labels: [] }
  }
  let total = 0
  const labels: { label: string; count: number }[] = []
  for (const [label, count] of Object.entries(byLabel)) {
    if (eventCategory({ label }) !== cat) continue
    total += count
    if (label !== '') labels.push({ label, count })
  }
  labels.sort((a, b) => b.count - a.count)
  return { total, labels }
}

// axisTicks escolhe até `maxTicks` rótulos de data distribuídos uniformemente ao longo
// da lista de dias (sempre incluindo o primeiro e o último), para o eixo X do gráfico.
// O rótulo é MM-DD (corta o ano de YYYY-MM-DD). Com poucos dias, devolve um por dia.
export function axisTicks(days: string[], maxTicks = 6): { index: number; label: string }[] {
  const n = days.length
  if (n === 0) return []
  const tick = (i: number) => ({ index: i, label: days[i].slice(5) })
  if (n <= maxTicks) return days.map((_, i) => tick(i))
  const idx = new Set<number>()
  for (let i = 0; i < maxTicks; i++) {
    idx.add(Math.round((i * (n - 1)) / (maxTicks - 1)))
  }
  return [...idx].sort((a, b) => a - b).map(tick)
}

// categoryBuckets dobra as contagens cruas por label nas categorias do app (mesma regra
// do eventCategory): label vazio → movimento, pessoa → pessoa, resto → o próprio label
// (fiel, dinâmico — não mais um bucket fixo "ia"). `byCategory` (opcional) traz
// categorias que não vêm de label — hoje `estados` (de camera_state_history). Chaves são
// inicializadas sob demanda (não um record fixo) — qualquer label novo vira uma entrada
// própria, sem precisar ser conhecido de antemão.
export function categoryBuckets(
  byLabel: Record<string, number>,
  byCategory?: Record<string, number>,
): Record<EventCategory, number> {
  const out: Record<EventCategory, number> = {}
  for (const [label, count] of Object.entries(byLabel)) {
    const cat = eventCategory({ label })
    out[cat] = (out[cat] ?? 0) + count
  }
  for (const [cat, count] of Object.entries(byCategory ?? {})) {
    out[cat] = (out[cat] ?? 0) + count
  }
  return out
}
