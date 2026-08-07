import type { MotionEvent, Recording } from './cameraUtils'

// Categoria de um evento (redesign do Escopo B — chips do painel de eventos).
// Transições de classificador de estado chegam ao feed com `kind:'state'` (mescladas
// no backend a partir de camera_state_history) e caem numa chave COMPOSTA por
// (classificador, estado) — `estados:<slug-do-nome>:<estado>`, ex. `estados:pessoa:saindo`
// — em vez do bucket genérico `'estados'` de antes: um classificador pode se chamar
// "Pessoa" e coincidir visualmente com a categoria real `'pessoa'` (detecção de objeto
// YOLO, `label='person'`), duas fontes de dados diferentes que só compartilham o nome por
// coincidência (achado real desta história). O slug é o nome do classificador normalizado
// (trim+lowercase, mesma normalização de `MotionCategory`/labels comuns abaixo) — nome é
// único POR CÂMERA (constraint de banco, ver migration 0048), então a chave nunca fica
// ambígua dentro da mesma câmera; classificadores homônimos em câmeras DIFERENTES
// compartilham a mesma chave de propósito (mesma UX de `'pessoa'`/`'movimento'`, que já
// agregam todas as câmeras sob um único filtro). Os demais eventos derivam do label —
// fiel ao valor real detectado (ex.: "carro"), não mais um bucket genérico "ia" que
// descartava a classificação (mesma regra do `MotionCategory` no backend,
// internal/db/reports.go). `movimento`/`pessoa`/qualquer `estados:*` continuam como
// categorias "conhecidas" do produto (cor fixa, ver `categoryColor`); qualquer outro
// valor é um label real, dinâmico.
export type EventCategory = string
export type EventFilter = 'todos' | EventCategory

// slugifyClassifierName normaliza o nome de um classificador pra uso como identificador
// dentro da chave composta — mesma normalização (trim+lowercase) que labels comuns já
// recebem abaixo, sem remoção de acentos (mesma limitação aceita hoje pra labels comuns).
function slugifyClassifierName(name: string): string {
  return name.trim().toLowerCase()
}

export function eventCategory(
  ev: Pick<MotionEvent, 'label' | 'kind' | 'classifier_name'>,
): EventCategory {
  if (ev.kind === 'state') {
    const slug = slugifyClassifierName(ev.classifier_name ?? '')
    const state = (ev.label ?? '').trim()
    return `estados:${slug}:${state}`
  }
  const label = (ev.label ?? '').trim()
  if (!label) return 'movimento'
  if (/pessoa|person/i.test(label)) return 'pessoa'
  return label.toLowerCase()
}

export type RecordingCategory = EventCategory | 'continua'

// Uma entrada de paleta por categoria — as 3 variantes (fundo/borda/traço SVG) do MESMO
// tom, usadas em pontos diferentes da UI (linha da régua, borda de card, contorno do
// donut de relatórios). IMPORTANTE: as 3 classes de cada entrada são strings LITERAIS
// (nunca construídas em runtime por concatenação/`.replace()`) — o Tailwind descobre
// classes "dinâmicas" fazendo varredura de TEXTO nos arquivos-fonte, não avaliação de JS;
// uma classe só existe no CSS final se aparecer LITERALMENTE em algum arquivo escaneado.
// Uma versão anterior gerava `border-*`/`stroke-*` via `categoryColor(...).replace('bg-
// ','border-')` — parecia funcionar nos 4 tons "conhecidos" só por COINCIDÊNCIA (essas
// classes literais já existiam em outros componentes do app, por motivos não
// relacionados), mas os 8 tons da paleta de labels arbitrários nunca tiveram `border-*`/
// `stroke-*` gerado — bug real, confirmado inspecionando o CSS compilado (`yarn build`).
interface CategoryPalette {
  bg: string
  border: string
  stroke: string
}

// Cores fixas das categorias "conhecidas" do produto — mesmas cores já usadas em vários
// lugares (dot de gravação, badges). `continua` não é um EventCategory (não vem de
// label nenhum — é a ausência de qualquer evento no chunk, ver `recordingCategory`
// abaixo), mas é um valor de `RecordingCategory` tão "conhecido" quanto os outros 3, daí
// entrar aqui também — mesma fonte única de cor pra QUALQUER categoria (evento ou
// gravação). Qualquer outro label (dinâmico) usa a paleta por hash abaixo.
const KNOWN_COLORS: Record<string, CategoryPalette> = {
  movimento: { bg: 'bg-amber-400', border: 'border-amber-400', stroke: 'stroke-amber-400' },
  pessoa: { bg: 'bg-red-500', border: 'border-red-500', stroke: 'stroke-red-500' },
  estados: { bg: 'bg-green-500', border: 'border-green-500', stroke: 'stroke-green-500' },
  continua: { bg: 'bg-blue-500', border: 'border-blue-500', stroke: 'stroke-blue-500' },
}

// Paleta fixa pra labels arbitrários — resto do espectro, evitando os tons já usados
// pelas categorias conhecidas acima (âmbar/vermelho/verde/azul).
const LABEL_PALETTE: CategoryPalette[] = [
  { bg: 'bg-violet-500', border: 'border-violet-500', stroke: 'stroke-violet-500' },
  { bg: 'bg-cyan-500', border: 'border-cyan-500', stroke: 'stroke-cyan-500' },
  { bg: 'bg-orange-500', border: 'border-orange-500', stroke: 'stroke-orange-500' },
  { bg: 'bg-pink-500', border: 'border-pink-500', stroke: 'stroke-pink-500' },
  { bg: 'bg-lime-500', border: 'border-lime-500', stroke: 'stroke-lime-500' },
  { bg: 'bg-indigo-500', border: 'border-indigo-500', stroke: 'stroke-indigo-500' },
  { bg: 'bg-teal-500', border: 'border-teal-500', stroke: 'stroke-teal-500' },
  { bg: 'bg-fuchsia-500', border: 'border-fuchsia-500', stroke: 'stroke-fuchsia-500' },
]

// paletteFor resolve a paleta (3 variantes) de uma categoria — fixa pras conhecidas,
// determinística por HASH pra qualquer label arbitrário (a MESMA string sempre cai na
// MESMA paleta, em qualquer sessão ou página — sem precisar cadastrar cor por label).
function paletteFor(category: string): CategoryPalette {
  // QUALQUER categoria de transição de estado (`estados:<slug>:<estado>`) usa o mesmo
  // verde fixo, independente do classificador — o verde já é a "assinatura visual" de
  // state classifier em toda a UI (timeline, thumbnail, régua); fragmentar por
  // classificador tornaria mais difícil reconhecer "isso é uma transição de estado" de
  // relance. A granularidade fica só no texto (`categoryLabel`), não na cor.
  if (category === 'estados' || category.startsWith('estados:')) return KNOWN_COLORS.estados
  const known = KNOWN_COLORS[category]
  if (known) return known
  let hash = 0
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) | 0
  }
  return LABEL_PALETTE[Math.abs(hash) % LABEL_PALETTE.length]
}

// categoryColor devolve a cor de FUNDO (classe Tailwind `bg-*`) de uma categoria.
export function categoryColor(category: string): string {
  return paletteFor(category).bg
}

// categoryBorderColor devolve a cor de BORDA (classe Tailwind `border-*`) — mesmo tom de
// `categoryColor` pra a MESMA categoria, sem duplicar a paleta.
export function categoryBorderColor(category: string): string {
  return paletteFor(category).border
}

// categoryStrokeColor devolve a cor de TRAÇO SVG (classe Tailwind `stroke-*`) — mesmo tom
// de `categoryColor`/`categoryBorderColor`, usado pelo contorno do donut de categorias
// (ReportsPage.tsx). SVG `stroke` como atributo de apresentação espera uma cor CSS crua
// (hex/rgb), não uma classe utilitária — por isso vira `className`, nunca `stroke={...}`.
export function categoryStrokeColor(category: string): string {
  return paletteFor(category).stroke
}

// categoryLabel formata uma categoria pra exibição: capitaliza a 1ª letra pro caso comum
// ("movimento"→"Movimento", "carro"→"Carro"); uma categoria composta de estado
// (`estados:<slug>:<estado>`) vira "Estados: <Nome> · <estado>" — só o slug (nome do
// classificador) é capitalizado, o estado fica cru como veio (mesma convenção de labels
// comuns, que também não têm capitalização própria além da 1ª letra do bucket).
export function categoryLabel(category: string): string {
  if (!category) return category
  if (category.startsWith('estados:')) {
    const [, slug, state] = category.split(':')
    const name = slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : ''
    return `Estados: ${name} · ${state ?? ''}`
  }
  return category.charAt(0).toUpperCase() + category.slice(1)
}

// categoryTier ordena a PRIORIDADE de uma categoria pra resolver um chunk com vários
// eventos: pessoa (0, topo) > qualquer label específico (1) > movimento (2) > qualquer
// estados:* (3, fundo). Detecção real predomina; um chunk cujo único evento é uma
// transição de estado fica na categoria de estado (verde, como na timeline) em vez de
// cair em `continua` (azul).
function categoryTier(cat: string): number {
  if (cat === 'pessoa') return 0
  if (cat === 'movimento') return 2
  if (cat === 'estados' || cat.startsWith('estados:')) return 3
  return 1
}

// RecordingPadding alarga a janela de contenção de recordingCategory nas duas pontas —
// mesmo padding (lead/trail, em ms) que internal/storage/cleaner.go já usa e testa pra
// computar has_motion no backend. Sem padding (omitido), a janela é só [start, start+
// chunk), igual a antes.
export interface RecordingPadding {
  leadMs: number
  trailMs: number
}

// recordingCategory classifica um chunk de gravação pela categoria dos eventos na sua
// janela de contenção — [start - trailMs, start+chunk + leadMs) quando `padding` é
// passado (mesma fórmula de internal/storage/cleaner.go: evento conta se
// `recording.start < evento + trail && recording.end > evento - lead`), ou
// [start, start+chunk) sem padding: a de maior prioridade (`categoryTier`); `continua`
// se não houver evento. Entre múltiplos labels ESPECÍFICOS distintos no mesmo chunk
// (tier 1), desempata por CONTAGEM de ocorrências no próprio chunk (mais eventos vence)
// e depois por ordem ALFABÉTICA — determinístico, não depende da ordem de
// iteração/chegada dos eventos. Usado para colorir o thumbnail no filmstrip (legenda).
export function recordingCategory(
  rec: Pick<Recording, 'start'>,
  events: Pick<MotionEvent, 'time' | 'label' | 'kind'>[],
  chunkMs: number,
  padding?: RecordingPadding,
): RecordingCategory {
  const start = Date.parse(rec.start)
  if (Number.isNaN(start)) return 'continua'
  const end = start + chunkMs
  const rangeStart = start - (padding?.trailMs ?? 0)
  const rangeEnd = end + (padding?.leadMs ?? 0)
  const counts = new Map<string, number>()
  for (const ev of events) {
    const t = Date.parse(ev.time)
    if (Number.isNaN(t) || t < rangeStart || t >= rangeEnd) continue
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
  if (cat === 'pessoa') return 'Pessoa detectada'
  if (cat === 'movimento') return 'Movimento detectado'
  if (cat === 'estados' || cat.startsWith('estados:')) return (ev.label ?? '').trim() || 'Estado'
  return categoryLabel(cat)
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

// Filtro da timeline de 24h — dropdown dinâmico do Histórico (`#history-filter-dropdown`,
// HistoryPage.tsx), populado com `todos` + `continua` (fixos) + as categorias que de fato
// existem nas gravações do dia. Deixou de ser um conjunto fixo de 4 valores — qualquer
// categoria real (`RecordingCategory`) é um filtro válido.
export type TimelineFilter = 'todos' | RecordingCategory

// matchesTimelineFilter resolve se `category` bate com o filtro selecionado no dropdown —
// igualdade ESTRITA (fora de "todos", que casa com qualquer categoria). O modelo antigo
// tinha uma dicotomia mais grossa pra "movimento" (casava com QUALQUER categoria de
// evento) — deixou de fazer sentido num dropdown de labels dinâmicos: "Tudo" já cobre
// esse caso, e cada opção do dropdown deve filtrar exatamente pelo que ela diz.
export function matchesTimelineFilter(
  category: RecordingCategory,
  filter: TimelineFilter,
): boolean {
  if (filter === 'todos') return true
  return category === filter
}
