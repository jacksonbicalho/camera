import { useCallback, useEffect, useRef, useState } from 'react'
import { getToken } from '../auth'
import { CHUNK_FALLBACK_MS, type Recording } from '../pages/cameraUtils'
import {
  CAT_PRIORITY as EVENT_CAT_PRIORITY,
  matchesTimelineFilter,
  type RecordingCategory,
  type TimelineFilter,
} from '../pages/eventCategory'
import {
  isCoveredByRecording,
  posToTime,
  recordingAtMs,
  spreadFractions,
  timePosFraction,
  type TimelineWindow,
} from './timelineScale'

interface RecordingItem {
  rec: Recording
  category: RecordingCategory
}

interface HistoryTimelineProps {
  /** TODAS as gravações do dia (mesmo universo de dados da lista agrupada abaixo — a lista
   * e a régua sempre mostram todas as gravações existentes, nunca um subconjunto: o filtro
   * de categoria não remove nada daqui, só esmaece via `filter` abaixo). Cor do bloco de
   * hora é sempre a categoria de maior prioridade entre TODOS os itens da hora, com ou sem
   * `filter` ativo. */
  recordingItems: RecordingItem[]
  /** Chamado com o id da gravação escolhida (clique na trilha ou soltar a alça). */
  onSelect: (id: number) => void
  /** Câmera do Histórico atual — monta a URL do preview (event-frame). */
  cameraId: string
  /** Gravação selecionada atualmente — posiciona a alça em repouso (fora de um arraste
   * em andamento). Sem seleção, a alça não aparece. */
  selectedId?: number | null
  /** Filtro de categoria ativo (chip Tudo/Movimento/Pessoa/Contínua) — só esmaece
   * (`opacity`) as linhas verticais de gravações que não batem com ele; NUNCA remove
   * nenhuma gravação de `recordingItems` nem afeta a cor do bloco de hora (essa continua
   * agregando todos os itens, filtrados ou não). Omitido = sem esmaecimento (todas as
   * linhas full-opacity) — comportamento retrocompatível pra quem não passar a prop. */
  filter?: TimelineFilter
  /** Dia sendo exibido (qualquer instante dele — só ano/mês/dia local importam). Define a
   * janela de 24h mesmo quando o filtro ativo deixa `recordingItems` vazio: sem essa prop,
   * a janela seria derivada do 1º item de `recordingItems`, que não existe nesse caso — a
   * régua inteira (blocos neutros, resumo, alça) sumiria por causa do filtro, em vez de só
   * as horas sem gravação virarem neutras (o resto do dia pode ter gravação em outra
   * categoria). Opcional só para não quebrar chamadores/testes que não têm um "dia"
   * próprio pra passar — nesse caso cai no comportamento antigo (deriva do 1º item, exige
   * `recordingItems` não vazio). */
  day?: Date
}

// Prioridade (maior → menor) para resolver a cor de um bloco de hora com várias
// categorias presentes — a mesma ordem de eventCategory.ts, com 'continua' ao final
// (sem eventos, só gravação contínua — a categoria mais "fraca").
const CAT_PRIORITY: RecordingCategory[] = [...EVENT_CAT_PRIORITY, 'continua']

const CAT_BG: Record<RecordingCategory, string> = {
  continua: 'bg-blue-500',
  movimento: 'bg-amber-400',
  pessoa: 'bg-red-500',
  ia: 'bg-violet-500',
  estados: 'bg-green-500',
}

// Marcação de TODAS as horas do dia (0..23) — formato compacto (sem zero-pad nem
// sufixo "h") pra caber em telas estreitas, onde a régua vira a largura total da
// viewport (abaixo do breakpoint lg as duas colunas do Histórico empilham).
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i)
// Atraso entre o mouse parar de se mover e o preview (imagem + horário) aparecer — sem
// isso, CADA `mousemove` trocaria o `src` da <img> e bateria em GET .../event-frame, que
// no backend faz os.ReadDir + spawna um processo ffmpeg por chamada (extractFrame):
// passar o mouse pela régua geraria dezenas de requisições/ffmpeg por segundo. A linha
// vertical indicadora continua instantânea (não custa nada) — só a imagem/horário do
// tooltip espera o mouse "descansar".
const PREVIEW_DEBOUNCE_MS = 150
// Largura de CADA linha vertical (px) — pedido do navigator: uma linha fina de verdade
// (1px) sumia visualmente numa régua densa (centenas de gravações numa hora só), mesmo
// tecnicamente presente no DOM. 3px por linha garante que cada gravação continua
// individualmente visível mesmo lado a lado com outras.
const LINE_WIDTH_PX = 3
// Separação mínima ENTRE LINHAS VIZINHAS, em pixels reais (não fração fixa da hora) —
// gravações muito próximas no tempo (ex.: reconexões rápidas do gravador gerando vários
// chunks em segundos) teriam posições quase idênticas e colapsariam num só pixel,
// "sumindo" visualmente mesmo com uma linha por gravação de verdade no DOM (ver
// `spreadFractions`, timelineScale.ts). Uma fração FIXA (ex. 5% da hora) funciona numa
// tela larga (bloco de ~30-40px, 5% ≈ 1.5-2px) mas vira sub-pixel — logo invisível — numa
// coluna estreita (bloco de ~15px, 5% ≈ 0.75px): a separação precisa ser medida em PIXELS
// de verdade, não numa fração que encolhe junto com a tela (bug relatado pelo navigator:
// "as linhas precisam ser mais separadas... não está funcionando corretamente" — a fração
// fixa não bastava no viewport dele). Também usada, com o mesmo valor, como margem entre
// linhas no cálculo da largura PADRÃO de um bloco de hora (`DEFAULT_HOUR_WIDTH_PX` abaixo)
// — uma única constante de espaçamento pros dois usos, pedido do navigator ao testar
// 1.5px como valor (antes eram 3px, dobrando a largura reservada por linha sem motivo).
// `LINE_GAP_PX` é convertido pra fração a cada render a partir da largura REAL de um
// bloco de hora (medida via ResizeObserver na trilha, ver `trackCallbackRef` abaixo) —
// mesmo padrão de medição já usado em `HistoryPage.tsx` (`mainRef`/`mainHeight`) pra
// evitar depender de suposições de layout.
const LINE_GAP_PX = 1.5
// Nº de blocos de hora - 1 = nº de gaps de 1px (`gap-px`) entre eles na trilha.
const HOUR_GAP_COUNT_PX = 23
// Fração usada ANTES da 1ª medição (ResizeObserver ainda não disparou) e em testes
// (jsdom não tem ResizeObserver — degrada graciosamente, mesmo padrão de `HistoryPage`).
const FALLBACK_MIN_LINE_GAP_FRACTION = 0.05
// Quantas linhas de `LINE_WIDTH_PX` cabem, por padrão, em CADA bloco de hora — pedido
// do navigator: em vez de dimensionar a régua pela hora mais cheia REAL do dia
// (`peakCount`, que faria dias comuns nunca rolar), todo bloco de hora já nasce largo o
// bastante pra até 360 gravações (ex.: uma hora inteira de chunks de 10s), com a régua
// ficando SEMPRE mais larga que a área visível e o scroll horizontal SEMPRE ativo por
// padrão — não só em dias excepcionalmente cheios. "Por agora" (nota do navigator): um
// valor fixo, não uma projeção de crescimento futuro.
const DEFAULT_HOUR_LINE_CAPACITY = 360
// Largura mínima "padrão" de UM bloco de hora: `DEFAULT_HOUR_LINE_CAPACITY` linhas de
// `LINE_WIDTH_PX`px + uma margem de `LINE_GAP_PX` antes de cada uma E depois da última
// (N linhas → N+1 margens) — ex.: 360×3 + 361×1.5 = 1621.5px.
const DEFAULT_HOUR_WIDTH_PX =
  DEFAULT_HOUR_LINE_CAPACITY * LINE_WIDTH_PX + (DEFAULT_HOUR_LINE_CAPACITY + 1) * LINE_GAP_PX

function formatClock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// eventFrameURL monta a URL do frame limpo extraído no instante dado — mesmo padrão de
// CameraStatesSettingsPage.tsx.
function eventFrameURL(cameraId: string, ms: number): string {
  return `/api/cameras/${cameraId}/event-frame?time=${encodeURIComponent(new Date(ms).toISOString())}&token=${getToken()}`
}

// HistoryTimeline — régua de 24h abaixo do player: um bloco por hora, colorido pela
// categoria de maior prioridade presente naquela hora, mais um resumo (total de gravações
// + hora de pico), e uma alça redonda arrastável pra selecionar uma gravação.
//
// Interação deliberadamente sem o padrão que causou bugs no timeline horizontal anterior
// (removido): nada de listener em `window`, nada de estado de "arraste solto". A alça usa
// Pointer Events + `setPointerCapture` no próprio elemento — mesmo padrão já em produção
// na barra de progresso do VideoPlayer — que faz o browser entregar todo `pointermove`/
// `pointerup` seguinte pro mesmo elemento, mesmo se o cursor sair da área da alça. Durante
// o arraste, só a posição/preview acompanham (reaproveita o mesmo debounce do hover); o
// `onSelect` (que troca de gravação, recarregando o VideoPlayer) só dispara UMA vez, no
// `pointerup` — arrastar rápido pelo dia não deve trocar de gravação dezenas de vezes por
// segundo (custo bem mais alto que só buscar uma imagem de preview).
export default function HistoryTimeline({
  recordingItems,
  onSelect,
  cameraId,
  selectedId,
  day,
  filter,
}: HistoryTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  // Largura real (px) da trilha inteira, medida via ResizeObserver — usada só pra
  // calcular a separação mínima entre linhas em pixels de verdade (ver
  // LINE_GAP_PX acima), não pro cálculo de fração de clique/arraste (que já usa
  // `trackRef.current.getBoundingClientRect()` direto nos handlers, sob demanda).
  // Ref CALLBACK (não useRef+useEffect(deps:[])): mesmo padrão de `mainRef` em
  // HistoryPage.tsx — dispara de novo se o node for recriado, e funciona mesmo que o
  // 1º render aconteça antes do elemento existir.
  const [trackWidth, setTrackWidth] = useState<number | null>(null)
  const trackObserverRef = useRef<ResizeObserver | null>(null)
  const trackCallbackRef = useCallback((el: HTMLDivElement | null) => {
    trackRef.current = el
    trackObserverRef.current?.disconnect()
    trackObserverRef.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width != null) setTrackWidth(width)
    })
    observer.observe(el)
    trackObserverRef.current = observer
  }, [])
  // Deslocamento horizontal do scroll da régua (`#history-timeline-scroll`) — o preview
  // (miniatura + horário no hover) fica FORA do container que rola, pra não ser cortado
  // verticalmente por `overflow-y-hidden` (ele flutua ACIMA da trilha via `bottom-full`);
  // por isso sua posição horizontal é calculada em PIXELS (`previewFraction * trackWidth
  // - scrollLeft`, ver JSX abaixo) em vez de porcentagem simples — sem subtrair o scroll,
  // o preview ficaria "grudado" na posição de antes de rolar, dessincronizado da trilha
  // por baixo dele.
  const [scrollLeft, setScrollLeft] = useState(0)
  function handleTrackScroll(e: React.UIEvent<HTMLDivElement>) {
    setScrollLeft(e.currentTarget.scrollLeft)
  }
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draggingRef = useRef(false)
  // hoverFraction: posição do mouse/arraste, atualizada a cada movimento — move a linha
  // vertical e a alça instantaneamente. previewFraction: debounced — só ela dispara a
  // busca da imagem. dragFraction: posição corrente do arraste (null fora de um arraste);
  // enquanto não-null, é ela (não a posição da gravação selecionada) que a alça segue.
  const [hoverFraction, setHoverFraction] = useState<number | null>(null)
  const [previewFraction, setPreviewFraction] = useState<number | null>(null)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [dragFraction, setDragFraction] = useState<number | null>(null)
  // Posição de repouso da alça (fora de um arraste em andamento) — não é recomputada
  // direto de `selectedId` a cada render: um `pointerup` dentro da MESMA gravação que já
  // estava selecionada não muda `selectedId` (HistoryPage só troca de estado quando o id
  // muda de verdade), então recomputar sempre a partir do início da gravação faria a alça
  // "pular de volta" pro início dela mesmo depois de soltar num ponto mais à frente —
  // parecendo que um arraste pequeno "não fez nada" (queixa relatada). `pointerup` seta
  // esta posição diretamente pro ponto solto; só sincroniza com `selectedId` quando ele
  // muda "de fora" (clique na lista lateral, seleção automática ao trocar de dia).
  const [restingFraction, setRestingFraction] = useState<number | null>(null)
  // Guarda o último `selectedId` já sincronizado — precisa ser estado, não ref: o lint
  // (react-hooks/refs) barra ler/escrever `.current` durante o render.
  const [syncedSelectedId, setSyncedSelectedId] = useState<number | null | undefined>(undefined)

  useEffect(
    () => () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    },
    [],
  )

  // Sem `day` explícito, precisa de pelo menos 1 item pra saber que dia é (comportamento
  // antigo, mantido pra não quebrar chamadores que não têm um "dia" próprio pra passar).
  // Com `day`, a régua aparece mesmo sem NENHUM item (ex.: filtro ativo sem nenhuma
  // gravação da categoria naquele dia) — vira 24 blocos neutros, não desaparece.
  if (recordingItems.length === 0 && !day) return null

  const byHour = new Map<number, RecordingItem[]>()
  for (const item of recordingItems) {
    const hour = new Date(item.rec.start).getHours()
    const list = byHour.get(hour)
    if (list) list.push(item)
    else byHour.set(hour, [item])
  }

  // `byHour` itera na ordem de inserção de `recordingItems`, que vem em ordem
  // DECRESCENTE de horário (mesma convenção de `HistoryPage.tsx`) — o desempate por
  // contagem igual precisa comparar a hora numericamente (não a ordem de iteração),
  // senão empates favorecem a hora mais tardia em vez da mais cedo.
  let peakHour = 0
  let peakCount = -1
  for (const [hour, items] of byHour) {
    if (items.length > peakCount || (items.length === peakCount && hour < peakHour)) {
      peakCount = items.length
      peakHour = hour
    }
  }

  // Largura MÍNIMA por bloco de hora (px) — `DEFAULT_HOUR_WIDTH_PX` (largura padrão fixa,
  // pra até 360 linhas, ver comentário da constante) é o piso pra TODO bloco de hora,
  // COM OU SEM gravação — pedido do navigator: os blocos devem ser mais largos
  // independente de ter ou não gravação, não só quando o dia está cheio. Isso faz a régua
  // ficar SEMPRE mais larga que a área visível e o scroll horizontal
  // (`#history-timeline-scroll`) SEMPRE ativo por padrão. `Math.max` contra o valor
  // calculado a partir da hora mais cheia do dia (`peakCount`, mesma fórmula de margem de
  // `DEFAULT_HOUR_WIDTH_PX`) é só uma rede de segurança pro caso (hoje hipotético) de uma
  // hora real superar 360 gravações — nesse caso o piso fixo deixaria de bastar sozinho.
  const requiredHourWidthPx = Math.max(
    DEFAULT_HOUR_WIDTH_PX,
    peakCount * LINE_WIDTH_PX + (peakCount + 1) * LINE_GAP_PX,
  )

  // Largura REAL do conteúdo da trilha (24 blocos + gaps), pra qualquer cálculo de fração
  // de posição (clique/arraste) ou pixel (preview). NÃO é o mesmo que `trackWidth`
  // (medido via ResizeObserver): um `<div>` de fluxo normal como a trilha SEMPRE tem sua
  // própria caixa do tamanho do "containing block" (a largura VISÍVEL do scroll
  // `#history-timeline-scroll`), mesmo quando os filhos (blocos de hora, via `minWidth`)
  // transbordam e ficam mais largos — `getBoundingClientRect()`/`ResizeObserver` nunca
  // relatam esse transbordamento, só a caixa "oficial" da trilha. Usar `trackWidth`
  // (a largura visível) como divisor da fração faria clique/preview mapearem pro
  // instante errado sempre que a régua estiver "lotada" (bug pego no code review: passar
  // o mouse a 90% da ÁREA VISÍVEL selecionava um horário de ~21h, quando só as primeiras
  // ~3-4h estavam de fato ali). `Math.max` cobre os dois casos: dia comum, onde os
  // blocos crescem (via `flex-1`) além do mínimo pra preencher a largura visível medida
  // (`trackWidth` já reflete o total real); e dia lotado, onde os blocos ficam presos no
  // `requiredHourWidthPx` e o total transborda (a soma dos mínimos é maior que qualquer
  // largura visível, então vence o cálculo).
  const contentWidthPx = Math.max(trackWidth ?? 0, requiredHourWidthPx * 24 + HOUR_GAP_COUNT_PX)

  // Janela do dia: meia-noite local até +24h — régua fixa, sem seletor de janela/zoom (o
  // mockup não pede). Prefere `day` (sempre correto, mesmo com `recordingItems` vazio);
  // sem ele, deriva do 1º item — só possível porque o guard acima garante não-vazio nesse
  // caso.
  const referenceDay = day ?? new Date(recordingItems[0].rec.start)
  const dayStartMs = new Date(
    referenceDay.getFullYear(),
    referenceDay.getMonth(),
    referenceDay.getDate(),
  ).getTime()
  const win: TimelineWindow = { startMs: dayStartMs, endMs: dayStartMs + 24 * 3600_000 }

  function fractionFromClientX(clientX: number): number | null {
    const el = trackRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return null
    // `rect.left` já reflete a posição REAL na viewport (ajustada pelo scroll horizontal
    // de `#history-timeline-scroll` automaticamente, propriedade padrão de
    // `getBoundingClientRect()`) — só o DIVISOR precisa ser a largura do CONTEÚDO real,
    // não a da caixa visível/cortada da trilha (`rect.width` sozinho), senão a fração
    // mapeia pro instante errado numa régua "lotada" (ver comentário de `contentWidthPx`
    // acima). Usa `rect.width` FRESCO (não o `trackWidth` de estado, que só é atualizado
    // pelo ResizeObserver — resultado assíncrono, pode estar um passo atrás do clique
    // mais recente, e nem existe em teste/jsdom, que só mocka `getBoundingClientRect`).
    const width = Math.max(rect.width, requiredHourWidthPx * 24 + HOUR_GAP_COUNT_PX)
    const f = (clientX - rect.left) / width
    return f < 0 ? 0 : f > 1 ? 1 : f
  }

  // Atualiza a posição (linha vertical/alça, instantâneo) e agenda o preview (imagem +
  // horário, debounced) — usado tanto pelo hover na trilha quanto pelo arraste da alça,
  // pra não duplicar a lógica de debounce em dois lugares.
  function updatePosition(f: number) {
    setHoverFraction(f)
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    previewTimerRef.current = setTimeout(() => {
      setPreviewFraction(f)
      setPreviewFailed(false)
    }, PREVIEW_DEBOUNCE_MS)
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (draggingRef.current) return // arraste da alça manda durante o arraste, não o hover
    const f = fractionFromClientX(e.clientX)
    if (f == null) return
    updatePosition(f)
  }

  function handleMouseLeave() {
    if (draggingRef.current) return
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    setHoverFraction(null)
    setPreviewFraction(null)
  }

  // Resolve a gravação mais próxima de `f` e posiciona a alça — usada tanto pelo clique
  // direto na trilha quanto por soltar o arraste. As linhas verticais (uma por gravação,
  // ver render da trilha abaixo) são os ÚNICOS pontos onde a alça pode "grudar": a
  // posição de repouso sempre vai para o INÍCIO da gravação encontrada (`recordingAtMs`
  // sempre acha uma, mesmo numa lacuna sem gravação nenhuma) — nunca fica num ponto
  // livre/contínuo, mesmo soltando dentro da mesma gravação já selecionada (reverte de
  // propósito o comportamento anterior, que deixava a alça exatamente onde foi solta
  // quando caía dentro de uma gravação real).
  function commitSelection(f: number) {
    const ms = posToTime(f, win)
    const hit = recordingAtMs(recordingItems, ms, CHUNK_FALLBACK_MS)
    setRestingFraction(hit ? timePosFraction(Date.parse(hit.rec.start), win) : f)
    if (hit) onSelect(hit.rec.id)
  }

  function handleClick(e: React.MouseEvent) {
    const f = fractionFromClientX(e.clientX)
    if (f == null) return
    commitSelection(f)
  }

  function handleHandlePointerDown(e: React.PointerEvent) {
    draggingRef.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const f = fractionFromClientX(e.clientX)
    if (f == null) return
    setDragFraction(f)
    updatePosition(f)
  }

  function handleHandlePointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return
    const f = fractionFromClientX(e.clientX)
    if (f == null) return
    setDragFraction(f)
    updatePosition(f)
  }

  function handleHandlePointerUp(e: React.PointerEvent) {
    if (!draggingRef.current) return
    draggingRef.current = false
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    const f = dragFraction
    setDragFraction(null)
    setHoverFraction(null)
    setPreviewFraction(null)
    if (f == null) return
    commitSelection(f)
  }

  // Sem cobertura de gravação real no instante, não mostra o preview — uma miniatura da
  // gravação mais próxima insinuaria "tem vídeo aqui" numa lacuna franca do dia (ex.: hora
  // sem nenhuma gravação), o que é enganoso.
  const previewCandidateMs = previewFraction != null ? posToTime(previewFraction, win) : null
  const previewMs =
    previewCandidateMs != null &&
    isCoveredByRecording(recordingItems, previewCandidateMs, CHUNK_FALLBACK_MS)
      ? previewCandidateMs
      : null

  // Sincroniza `restingFraction` com `selectedId` só quando ele muda "de fora" (clique na
  // lista lateral, seleção automática ao trocar de dia) — ajuste durante o render (mesmo
  // padrão de `errorForId`/`continuousResetForDate` em HistoryPage.tsx), não
  // useEffect+setState. Um clique/soltar do PRÓPRIO timeline já setou `restingFraction`
  // direto (handleClick/handleHandlePointerUp) — não precisa (e não deve) recomputar daqui.
  if (selectedId !== syncedSelectedId) {
    setSyncedSelectedId(selectedId)
    const selectedItem =
      selectedId != null ? recordingItems.find((i) => i.rec.id === selectedId) : undefined
    setRestingFraction(
      selectedItem ? timePosFraction(Date.parse(selectedItem.rec.start), win) : null,
    )
  }
  const handleFraction = dragFraction ?? restingFraction

  return (
    <div id="history-timeline" className="mt-2 flex flex-col gap-1">
      <div id="history-timeline-summary" className="text-caption text-muted">
        {recordingItems.length} gravações
        {recordingItems.length > 0 && ` · pico entre ${peakHour}h e ${peakHour + 1}h`}
      </div>
      <div className="relative flex flex-col gap-1">
        {previewMs != null && (
          <div
            id="history-timeline-preview"
            className="pointer-events-none absolute bottom-full z-10 mb-1 flex -translate-x-1/2 flex-col items-center gap-1"
            style={{
              left:
                trackWidth != null
                  ? `${(previewFraction ?? 0) * contentWidthPx - scrollLeft}px`
                  : `${(previewFraction ?? 0) * 100}%`,
            }}
          >
            <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded border border-border bg-surface-2">
              {previewFailed ? (
                <span className="text-caption text-faint">sem prévia</span>
              ) : (
                <img
                  src={eventFrameURL(cameraId, previewMs)}
                  alt={formatClock(previewMs)}
                  className="h-full w-full object-cover"
                  onError={() => setPreviewFailed(true)}
                />
              )}
            </div>
            <span className="rounded bg-foreground/80 px-1.5 py-0.5 text-caption text-background">
              {formatClock(previewMs)} · pré-visualização
            </span>
          </div>
        )}
        {/* `#history-timeline-scroll` — trilha + labels rolam JUNTOS horizontalmente quando
            a hora mais cheia do dia exige mais espaço do que a tela cabe
            (`requiredHourWidthPx`, ver comentário acima de onde é calculado) — as 24 horas
            mantêm a MESMA largura entre si (não distorce a proporção de tempo), só o TOTAL
            passa a exceder a área visível nesse caso. `overflow-y-hidden` (não afeta o
            preview, que fica FORA deste container — ver comentário de `scrollLeft` acima)
            evita uma barra vertical indesejada; sem crowding, o conteúdo cabe inteiro e
            não aparece barra nenhuma (scroll só aparece quando de fato precisa). */}
        <div
          id="history-timeline-scroll"
          // `pt-4` (16px) dá espaço pra bolinha da alça (`-top-2.5` = -10px, ver comentário
          // abaixo), que sem isso ficava cortada por `overflow-y-hidden` — a caixa deste
          // container só tinha a altura da trilha (24px), então qualquer coisa desenhada
          // ACIMA dela (offset negativo) era clipada na hora, mesmo com z-index maior
          // (clipping não é stacking: um `overflow-y-hidden` corta o que sai da própria
          // caixa, independente de z-index). Bug relatado pelo navigator ("alça escondida")
          // numa hora bem cheia — na prática a alça sempre existiu ali, só invisível.
          // 16px de padding contra 10px de offset negativo (folga de 6px, não os 2px
          // originais de uma 1ª tentativa com `pt-3`) — margem confortável.
          className="scrollbar-thin overflow-x-auto overflow-y-hidden pt-4"
          onScroll={handleTrackScroll}
        >
          {/* Wrapper próprio (relative) só pra trilha + alça + linha de hover — a alça usa
              `bottom-0` ANCORADO NESTE wrapper (não no de fora, que também contém os
              números), pra que a ponta da seta pare sempre na base da trilha, nunca
              avançando sobre a linha de números por baixo (mesmo se ela descer). */}
          <div className="relative">
            <div
              id="history-timeline-track"
              ref={trackCallbackRef}
              role="button"
              tabIndex={0}
              aria-label="Selecionar gravação na régua de 24h"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
              className="flex h-6 gap-px rounded cursor-pointer"
            >
              {(() => {
                // Largura de UM bloco de hora (px) a partir da largura real do CONTEÚDO
                // (`contentWidthPx` — não `trackWidth`, que só reflete a caixa visível/
                // cortada da trilha, ver comentário de `contentWidthPx` acima) — 24 blocos
                // + 23 gaps de 1px (`gap-px`). `minLineGapFraction` converte o mínimo em
                // pixels (`LINE_GAP_PX`) pra uma fração daquele bloco especificamente —
                // ao contrário de uma fração fixa, não encolhe até sumir numa coluna
                // estreita (bug relatado). Sem medição ainda (1º render) ou em teste (jsdom
                // sem ResizeObserver), cai no fallback estático.
                const hourBoxWidthPx =
                  trackWidth != null ? (contentWidthPx - HOUR_GAP_COUNT_PX) / 24 : null
                const minLineGapFraction =
                  hourBoxWidthPx != null && hourBoxWidthPx > 0
                    ? Math.min(0.3, LINE_GAP_PX / hourBoxWidthPx)
                    : FALLBACK_MIN_LINE_GAP_FRACTION
                return Array.from({ length: 24 }, (_, hour) => {
                  const items = byHour.get(hour)
                  const cat = items
                    ? CAT_PRIORITY.find((c) => items.some((i) => i.category === c))
                    : undefined
                  // Início desta hora em ms (mesma janela local de `dayStartMs`) — base pra
                  // calcular a fração de CADA gravação DENTRO da hora (não do dia inteiro),
                  // uma linha vertical por gravação, na posição real (proporcional ao
                  // horário de início), não distribuída uniformemente por índice.
                  const hourStartMs = dayStartMs + hour * 3600_000
                  // `spreadFractions` garante separação mínima entre linhas vizinhas — sem
                  // isso, gravações muito próximas no tempo (reconexões rápidas do gravador)
                  // colapsam visualmente no mesmo pixel e "somem" (queixa relatada: N
                  // gravações mostrando bem menos que N linhas).
                  const positions = items
                    ? spreadFractions(
                        items.map((item) => {
                          const startMs = Date.parse(item.rec.start)
                          const frac = (startMs - hourStartMs) / 3600_000
                          return { id: item.rec.id, frac: frac < 0 ? 0 : frac > 1 ? 1 : frac }
                        }),
                        minLineGapFraction,
                      )
                    : null
                  return (
                    <div
                      key={hour}
                      id={`history-timeline-hour-${hour}`}
                      aria-hidden="true"
                      className={`relative h-full flex-1 ${cat ? CAT_BG[cat] : 'bg-surface-2'} ${
                        hour === 0 ? 'rounded-l' : hour === 23 ? 'rounded-r' : ''
                      }`}
                      style={{ minWidth: requiredHourWidthPx }}
                    >
                      {items?.map((item) => {
                        const clamped = positions!.get(item.rec.id)!
                        // Esmaece (não remove) gravações fora do filtro ativo — a régua
                        // sempre mostra TODAS as gravações da hora; `filter` só reduz a
                        // opacidade das que não batem, igual ao card correspondente na
                        // lista lateral (HistoryPage.tsx).
                        const dimmed =
                          filter != null && !matchesTimelineFilter(item.category, filter)
                        return (
                          <span
                            key={item.rec.id}
                            id={`history-timeline-hour-${hour}-rec-${item.rec.id}`}
                            className={`absolute top-0 h-full -translate-x-1/2 bg-foreground/70 ${dimmed ? 'opacity-40' : ''}`}
                            style={{ left: `${clamped * 100}%`, width: LINE_WIDTH_PX }}
                          />
                        )
                      })}
                    </div>
                  )
                })
              })()}
            </div>
            {handleFraction != null && (
              // Ponteiro estilo "lollipop" (bolinha + haste + seta apontando pra baixo, como
              // um ponteiro de relógio) — um único alvo de pointer events (a bolinha, a haste
              // e a seta arrastam juntas). `top`+`bottom` (em vez de uma altura fixa) faz a
              // haste esticar (`flex-1` no meio) pra acompanhar a trilha inteira. `-bottom-2`
              // (em vez de `bottom-0`) desce a ponta da seta um pouco PRA FORA da caixa da
              // trilha (não só encostada na borda) — a folga até a linha de números
              // (`mt-4` nela, ver abaixo) usa o MESMO INCREMENTO ABSOLUTO (+4px em cada,
              // não uma proporção) que o `-bottom-1`/`mt-3` anteriores, preservando os 12px
              // de folga (somados ao `gap-1` do flex) que evitam a seta cobrir os dígitos.
              // Posição em PIXELS (`contentWidthPx`), não porcentagem: o `.relative` que
              // contém a alça (ancestral posicionado mais próximo) nunca cresce além da
              // largura VISÍVEL de `#history-timeline-scroll` (block box comum, largura
              // travada no containing block, mesmo quando os filhos — os blocos de hora —
              // transbordam) — `left: X%` resolveria contra essa largura visível, não a do
              // conteúdo real, fazendo a alça flutuar "grudada" numa fração da JANELA em
              // vez da posição real no dia (bug pego no code review, reproduzido em
              // Chromium). Diferente do preview (fora do container de scroll), a alça e a
              // linha de hover ficam DENTRO dele — o próprio scroll nativo do navegador já
              // desloca sua posição visual ao rolar, então NÃO subtraem `scrollLeft` (isso
              // duplicaria o deslocamento). `z-20` garante que a alça sempre pinta por
              // cima das linhas verticais da trilha — numa hora bem cheia (muitas linhas
              // vizinhas), a bolinha/haste podiam "sumir" visualmente em meio à quantidade
              // de linhas próximas (queixa relatada pelo navigator).
              <div
                id="history-timeline-handle"
                role="button"
                tabIndex={0}
                aria-label="Arrastar para selecionar gravação"
                onPointerDown={handleHandlePointerDown}
                onPointerMove={handleHandlePointerMove}
                onPointerUp={handleHandlePointerUp}
                className="absolute -top-2.5 -bottom-2 z-20 flex -translate-x-1/2 touch-none cursor-grab flex-col items-center active:cursor-grabbing"
                style={{
                  left:
                    trackWidth != null
                      ? `${handleFraction * contentWidthPx}px`
                      : `${handleFraction * 100}%`,
                }}
              >
                <span className="h-3 w-3 shrink-0 rounded-full bg-primary shadow ring-2 ring-background" />
                <span className="w-1 flex-1 bg-primary" />
                <span
                  aria-hidden="true"
                  className="h-0 w-0 shrink-0 border-x-8 border-t-8 border-x-transparent border-t-primary"
                />
              </div>
            )}
            {hoverFraction != null && (
              <div
                className="pointer-events-none absolute top-0 h-6 -translate-x-1/2 bg-foreground/80"
                style={{
                  width: LINE_WIDTH_PX,
                  left:
                    trackWidth != null
                      ? `${hoverFraction * contentWidthPx}px`
                      : `${hoverFraction * 100}%`,
                }}
              />
            )}
          </div>
          {/* Mesmo esquema de 24 células flex-1 dos blocos da trilha (não justify-between,
              que espalha borda-a-borda) — cada número fica centralizado sob o bloco da
              própria hora, não numa fronteira entre dois blocos; `minWidth` igual ao dos
              blocos acima (`requiredHourWidthPx`) mantém os números alinhados mesmo quando
              a régua rola horizontalmente. `mt-4` (em vez do `gap-1` padrão do wrapper de
              fora, que sozinho não seria suficiente) dá espaço extra pra ponta da seta, que
              agora para na base do wrapper interno da trilha (ver comentário acima) em vez
              de esticar até aqui. */}
          <div id="history-timeline-labels" className="mt-4 flex text-body font-bold text-faint">
            {HOUR_LABELS.map((h) => (
              <span
                key={h}
                className="flex-1 text-center"
                style={{ minWidth: requiredHourWidthPx }}
              >
                {h}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
