import type { MotionEvent, Recording } from './cameraUtils'

// Categoria de um evento (redesign do Escopo B — chips do painel de eventos).
// Transições de classificador de estado chegam ao feed com `kind:'state'` (mescladas
// no backend a partir de camera_state_history) e caem em `estados`, independente do
// label; os demais derivam do label — fiel ao valor real detectado (ex.: "carro"), não
// mais um bucket genérico "ia" que descartava a classificação (mesma regra do
// `MotionCategory` no backend, internal/db/reports.go). `movimento`/`pessoa`/`estados`
// continuam como categorias "conhecidas" do produto (cor fixa, ver `categoryColor`);
// qualquer outro valor é um label real, dinâmico.
export type EventCategory = string
export type EventFilter = 'todos' | EventCategory

export function eventCategory(ev: Pick<MotionEvent, 'label' | 'kind'>): EventCategory {
  if (ev.kind === 'state') return 'estados'
  const label = (ev.label ?? '').trim()
  if (!label) return 'movimento'
  if (/pessoa|person/i.test(label)) return 'pessoa'
  return label.toLowerCase()
}

export type RecordingCategory = EventCategory | 'continua'

// Cores fixas das categorias "conhecidas" do produto — mesmas cores já usadas em vários
// lugares (dot de gravação, badges). Qualquer outro label (dinâmico) usa `categoryColor`.
const KNOWN_COLORS: Record<string, string> = {
  movimento: 'bg-amber-400',
  pessoa: 'bg-red-500',
  estados: 'bg-green-500',
}

// Paleta fixa pra labels arbitrários — resto do espectro, evitando os tons já usados
// pelas categorias conhecidas acima (âmbar/vermelho/verde) e por "continua" (azul,
// definido em HistoryTimeline.tsx/RecordingsPage.tsx).
const LABEL_PALETTE = [
  'bg-violet-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-lime-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-fuchsia-500',
]

// categoryColor devolve a cor (classe Tailwind `bg-*`) de uma categoria — fixa para as
// conhecidas (movimento/pessoa/estados), determinística por HASH para qualquer label
// arbitrário (a MESMA string sempre cai na MESMA cor da paleta, em qualquer sessão ou
// página — sem precisar cadastrar cor por label manualmente).
export function categoryColor(category: string): string {
  const known = KNOWN_COLORS[category]
  if (known) return known
  let hash = 0
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) | 0
  }
  const idx = Math.abs(hash) % LABEL_PALETTE.length
  return LABEL_PALETTE[idx]
}

// categoryLabel capitaliza a 1ª letra de uma categoria pra exibição — UMA função só,
// sem casos especiais: "movimento"→"Movimento", "carro"→"Carro" etc.
export function categoryLabel(category: string): string {
  if (!category) return category
  return category.charAt(0).toUpperCase() + category.slice(1)
}

// categoryTier ordena a PRIORIDADE de uma categoria pra resolver um chunk com vários
// eventos: pessoa (0, topo) > qualquer label específico (1) > movimento (2) > estados
// (3, fundo). Detecção real predomina; um chunk cujo único evento é uma transição de
// estado fica `estados` (verde, como na timeline) em vez de cair em `continua` (azul).
function categoryTier(cat: string): number {
  if (cat === 'pessoa') return 0
  if (cat === 'movimento') return 2
  if (cat === 'estados') return 3
  return 1
}

// recordingCategory classifica um chunk de gravação pela categoria dos eventos no seu
// intervalo [start, start+chunk): a de maior prioridade (`categoryTier`); `continua` se
// não houver evento. Entre múltiplos labels ESPECÍFICOS distintos no mesmo chunk (tier
// 1), desempata por CONTAGEM de ocorrências no próprio chunk (mais eventos vence) e
// depois por ordem ALFABÉTICA — determinístico, não depende da ordem de iteração/chegada
// dos eventos. Usado para colorir o thumbnail no filmstrip (legenda).
export function recordingCategory(
  rec: Pick<Recording, 'start'>,
  events: Pick<MotionEvent, 'time' | 'label' | 'kind'>[],
  chunkMs: number,
): RecordingCategory {
  const start = Date.parse(rec.start)
  if (Number.isNaN(start)) return 'continua'
  const end = start + chunkMs
  const counts = new Map<string, number>()
  for (const ev of events) {
    const t = Date.parse(ev.time)
    if (Number.isNaN(t) || t < start || t >= end) continue
    const cat = eventCategory(ev)
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [cat, count] of counts) {
    if (best === null) {
      best = cat
      bestCount = count
      continue
    }
    const tier = categoryTier(cat)
    const bestTier = categoryTier(best)
    if (tier < bestTier) {
      best = cat
      bestCount = count
    } else if (tier === bestTier && (count > bestCount || (count === bestCount && cat < best))) {
      best = cat
      bestCount = count
    }
  }
  return best ?? 'continua'
}

// firstEventInChunk devolve o evento mais antigo (por `time`) dentro do intervalo do
// chunk `[start, start+chunk)` — mesma janela do recordingCategory —, ou `null` quando
// não houver. Opera sobre a lista já unificada, então inclui qualquer `kind`
// (movimento/pessoa/qualquer label específico/estado). Usado para selecionar o evento ao
// clicar no thumb.
export function firstEventInChunk<T extends Pick<MotionEvent, 'time'>>(
  rec: Pick<Recording, 'start'>,
  events: T[],
  chunkMs: number,
): T | null {
  const start = Date.parse(rec.start)
  if (Number.isNaN(start)) return null
  const end = start + chunkMs
  let best: T | null = null
  let bestT = Infinity
  for (const ev of events) {
    const t = Date.parse(ev.time)
    if (Number.isNaN(t) || t < start || t >= end) continue
    if (t < bestT) {
      best = ev
      bestT = t
    }
  }
  return best
}

// Título legível do evento por categoria, para o card do painel de eventos. Qualquer
// label específico (fora das categorias conhecidas) usa `categoryLabel` — fiel ao valor
// real, capitalizado, sem caso especial (era um bucket "Detecção IA" genérico antes).
export function eventTitle(ev: Pick<MotionEvent, 'label' | 'kind'>): string {
  const cat = eventCategory(ev)
  switch (cat) {
    case 'pessoa':
      return 'Pessoa detectada'
    case 'movimento':
      return 'Movimento detectado'
    case 'estados':
      return (ev.label ?? '').trim() || 'Estado'
    default:
      return categoryLabel(cat)
  }
}

// eventCardLines devolve as duas linhas do card de evento (título em cima, subtítulo
// embaixo). Para transições de estado mostra o classificador no título e o estado no
// subtítulo (ex.: "Janela" / "apagada"); para os demais, a descrição do evento no
// título e a câmera no subtítulo.
export function eventCardLines(
  ev: Pick<MotionEvent, 'label' | 'kind' | 'classifier_name'>,
  cameraName: string,
): { title: string; subtitle: string } {
  if (ev.kind === 'state') {
    return { title: ev.classifier_name || cameraName, subtitle: eventTitle(ev) }
  }
  return { title: eventTitle(ev), subtitle: cameraName }
}

export function filterEventsByCategory<T extends Pick<MotionEvent, 'label' | 'kind'>>(
  events: T[],
  filter: EventFilter,
): T[] {
  if (filter === 'todos') return events
  return events.filter((ev) => eventCategory(ev) === filter)
}

// Filtro da timeline de 24h (chips "Tudo/Movimento/Pessoa/Contínua" do Histórico) —
// dicotomia mais grossa que EventFilter (tem evento vs. não tem) para "movimento", mais
// um refinamento estrito ("pessoa") — não as 4 categorias finas completas do painel de
// eventos (sem "ia"/"estados" à parte).
export type TimelineFilter = 'todos' | 'movimento' | 'pessoa' | 'continua'

// matchesTimelineFilter resolve se `category` bate com o filtro simples da timeline de
// 24h: "movimento" casa com QUALQUER categoria de evento (movimento/pessoa/ia/estados),
// não só a literal "movimento" — a timeline não distingue tipo de evento, só "tem
// movimento" vs. "só contínua". "pessoa" é o único filtro estrito aqui (igualdade de
// categoria) — propositalmente se sobrepõe a "movimento" (que continua mostrando tudo,
// inclusive pessoa), em vez de reparticionar os filtros existentes.
export function matchesTimelineFilter(
  category: RecordingCategory,
  filter: TimelineFilter,
): boolean {
  if (filter === 'todos') return true
  if (filter === 'continua') return category === 'continua'
  if (filter === 'pessoa') return category === 'pessoa'
  return category !== 'continua'
}
