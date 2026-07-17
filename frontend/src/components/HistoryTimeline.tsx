import { useEffect, useRef, useState } from 'react'
import { getToken } from '../auth'
import { CHUNK_FALLBACK_MS, type Recording } from '../pages/cameraUtils'
import {
  CAT_PRIORITY as EVENT_CAT_PRIORITY,
  matchesTimelineFilter,
  type RecordingCategory,
  type TimelineFilter,
} from '../pages/eventCategory'
import {
  computeHourLayout,
  hourBoxWidthPx,
  isCoveredByRecording,
  pixelToTimeFraction,
  posToTime,
  recordingAtMs,
  spreadFractions,
  timeFractionToPixel,
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
// individualmente visível mesmo lado a lado com outras. Medida do protótipo de referência
// (`TimelineHour.tsx`, descartado como código, só serviu de referência de layout/medidas).
const LINE_WIDTH_PX = 3
// Separação mínima ENTRE LINHAS VIZINHAS, em pixels reais (não fração fixa da hora) —
// gravações muito próximas no tempo (ex.: reconexões rápidas do gravador gerando vários
// chunks em segundos) teriam posições quase idênticas e colapsariam num só pixel,
// "sumindo" visualmente mesmo com uma linha por gravação de verdade no DOM (ver
// `spreadFractions`, timelineScale.ts). Também usada, com o mesmo valor, como margem entre
// linhas no cálculo da largura de um card de hora (`hourBoxWidthPx`, timelineScale.ts).
// Mesma medida do protótipo de referência.
const LINE_GAP_PX = 1.5
// Gap visível ENTRE os cards de hora (não confundir com `LINE_GAP_PX`, a margem entre
// LINHAS dentro do mesmo card) — cada hora é um card discreto (não mais uma barra
// contínua de blocos colados). Mesma medida do protótipo de referência.
const CARD_GAP_PX = 12
// Padding lateral fixo reservado em CADA card, além do espaço ocupado pelas próprias
// linhas — mesma medida do protótipo de referência.
const CARD_PADDING_PX = 16
// Largura mínima de um card de hora, mesmo sem nenhuma gravação (ou com poucas) — mesma
// medida do protótipo de referência. Cada card cresce PROPORCIONALMENTE à quantidade de
// gravações daquela hora específica (ver `hourBoxWidthPx`) — diferente do desenho anterior
// (todo bloco com a MESMA largura fixa, pensada pra até 360 linhas), pedido do navigator ao
// ver o protótipo: cards de hora vazia/rala não devem reservar o mesmo espaço que uma hora
// cheia.
const MIN_HOUR_WIDTH_PX = 80
// Nº de horas do dia — usado só pra gerar os 24 arrays de largura/offset por hora.
const HOURS_PER_DAY = 24

function formatClock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// eventFrameURL monta a URL do frame limpo extraído no instante dado — mesmo padrão de
// CameraStatesSettingsPage.tsx.
function eventFrameURL(cameraId: string, ms: number): string {
  return `/api/cameras/${cameraId}/event-frame?time=${encodeURIComponent(new Date(ms).toISOString())}&token=${getToken()}`
}

// HistoryTimeline — régua de 24h abaixo do player: um card por hora (largura própria,
// proporcional à quantidade de gravações daquela hora), colorido pela categoria de maior
// prioridade presente nela, com um cabeçalho (hora + contagem) acima da mini-caixa de
// linhas, mais um resumo geral (total de gravações) e uma alça redonda arrastável pra
// selecionar uma gravação.
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
  // Ref simples (não callback) — a largura de cada card vem só da CONTAGEM de gravações
  // (determinística, conhecida no 1º render), não mais de uma medição via ResizeObserver:
  // só precisamos deste ref pra ler `getBoundingClientRect().left` sob demanda nos handlers
  // de clique/arraste (posição do elemento na viewport), nunca pra largura/conteúdo.
  const trackRef = useRef<HTMLDivElement | null>(null)
  // Deslocamento horizontal do scroll da régua (`#history-timeline-scroll`) — o preview
  // (miniatura + horário no hover) fica FORA do container que rola, pra não ser cortado
  // verticalmente por `overflow-y-hidden` (ele flutua ACIMA da trilha via `bottom-full`);
  // por isso sua posição horizontal é calculada em PIXELS (`- scrollLeft`, ver JSX abaixo)
  // em vez de porcentagem simples — sem subtrair o scroll, o preview ficaria "grudado" na
  // posição de antes de rolar, dessincronizado da trilha por baixo dele.
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
  // gravação da categoria naquele dia) — vira 24 cards neutros, não desaparece.
  if (recordingItems.length === 0 && !day) return null

  const byHour = new Map<number, RecordingItem[]>()
  for (const item of recordingItems) {
    const hour = new Date(item.rec.start).getHours()
    const list = byHour.get(hour)
    if (list) list.push(item)
    else byHour.set(hour, [item])
  }

  // Largura (px) de CADA card de hora — proporcional à sua PRÓPRIA contagem de gravações
  // (não mais uma largura uniforme compartilhada por todas as 24 horas); e o layout
  // (offsets acumulados) derivado dela — necessário pra qualquer cálculo de posição em
  // pixel (clique/arraste/preview), já que cards de larguras diferentes tornam a relação
  // entre "fração do dia" e "posição x" não-linear (ver `timeFractionToPixel`,
  // timelineScale.ts).
  const hourWidths = Array.from({ length: HOURS_PER_DAY }, (_, hour) =>
    hourBoxWidthPx(
      byHour.get(hour)?.length ?? 0,
      LINE_WIDTH_PX,
      LINE_GAP_PX,
      CARD_PADDING_PX,
      MIN_HOUR_WIDTH_PX,
    ),
  )
  const layout = computeHourLayout(hourWidths, CARD_GAP_PX)

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
    // `getBoundingClientRect()`) — o pixel relativo ao CONTEÚDO da trilha é só a diferença.
    // `pixelToTimeFraction` (timelineScale.ts) faz o mapeamento inverso (pixel → fração do
    // dia) considerando a largura PRÓPRIA de cada card de hora — não uma divisão simples
    // por uma largura uniforme, já que os cards agora têm larguras diferentes entre si.
    return pixelToTimeFraction(clientX - rect.left, hourWidths, layout)
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
      </div>
      <div className="relative flex flex-col gap-1">
        {previewMs != null && (
          <div
            id="history-timeline-preview"
            className="pointer-events-none absolute bottom-full z-10 mb-1 flex -translate-x-1/2 flex-col items-center gap-1"
            style={{
              left: `${timeFractionToPixel(previewFraction ?? 0, hourWidths, layout) - scrollLeft}px`,
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
        {/* `#history-timeline-scroll` — cabeçalhos + trilha rolam JUNTOS horizontalmente
            sempre que a soma dos cards (cada um proporcional à sua contagem de gravações)
            exceder a área visível. `overflow-y-hidden` (não afeta o preview, que fica FORA
            deste container — ver comentário de `scrollLeft` acima) evita uma barra vertical
            indesejada. */}
        <div
          id="history-timeline-scroll"
          // `pt-4` (16px) dá espaço pra bolinha da alça (`-top-2.5` = -10px, ver comentário
          // abaixo), que sem isso ficava cortada por `overflow-y-hidden` — a caixa deste
          // container só tinha a altura da trilha, então qualquer coisa desenhada ACIMA
          // dela (offset negativo) era clipada na hora, mesmo com z-index maior (clipping
          // não é stacking: um `overflow-y-hidden` corta o que sai da própria caixa,
          // independente de z-index). 16px de padding contra 10px de offset negativo
          // (folga de 6px) — margem confortável.
          className="scrollbar-thin overflow-x-auto overflow-y-hidden pt-4"
          onScroll={handleTrackScroll}
        >
          {/* Cabeçalho por card (hora + contagem de gravações daquela hora) — cada card de
              hora se descreve por conta própria, acima da própria mini-caixa, no espírito
              do protótipo de referência (`TimelineHour.tsx`, descartado como código).
              Mesmo `gap` da trilha abaixo, e a MESMA largura (proporcional à contagem, via
              `hourWidths`) por coluna, pra cada cabeçalho ficar alinhado exatamente sobre o
              card correspondente. */}
          <div
            id="history-timeline-headers"
            className="flex text-caption text-faint"
            style={{ gap: CARD_GAP_PX }}
          >
            {Array.from({ length: HOURS_PER_DAY }, (_, hour) => {
              const count = byHour.get(hour)?.length ?? 0
              return (
                <div
                  key={hour}
                  id={`history-timeline-hour-${hour}-header`}
                  className="shrink-0 truncate text-center"
                  style={{ width: hourWidths[hour] }}
                >
                  {hour}h · {count} {count === 1 ? 'gravação' : 'gravações'}
                </div>
              )
            })}
          </div>
          {/* Wrapper próprio (relative) só pra trilha + alça + linha de hover — a alça usa
              `bottom-0` ANCORADO NESTE wrapper (não no dos cabeçalhos acima), pra que a
              ponta da seta pare sempre na base da trilha, nunca avançando sobre os
              cabeçalhos por cima. */}
          <div className="relative mt-1">
            <div
              id="history-timeline-track"
              ref={trackRef}
              role="button"
              tabIndex={0}
              aria-label="Selecionar gravação na régua de 24h"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
              className="flex h-6 cursor-pointer"
              style={{ gap: CARD_GAP_PX }}
            >
              {Array.from({ length: HOURS_PER_DAY }, (_, hour) => {
                const items = byHour.get(hour)
                const cat = items
                  ? CAT_PRIORITY.find((c) => items.some((i) => i.category === c))
                  : undefined
                const hourWidthPx = hourWidths[hour]
                // Mínimo em PIXELS convertido pra uma fração DESTE card especificamente
                // (cada card tem sua própria largura agora, proporcional à contagem) — ao
                // contrário de uma fração fixa, não encolhe até sumir numa coluna estreita.
                // `spreadFractions` (`timelineScale.ts`) aplica esse mínimo entre os
                // CENTROS de linhas vizinhas, não entre as bordas — como cada linha tem
                // `LINE_WIDTH_PX` de largura própria (não um traço de 1px, quase um ponto),
                // usar só `LINE_GAP_PX` como distância mínima entre centros faria duas
                // linhas de largura real se sobreporem — o mínimo entre centros precisa
                // ser o PASSO inteiro (`LINE_WIDTH_PX + LINE_GAP_PX`), a mesma conta já
                // usada em `hourBoxWidthPx` (timelineScale.ts) pra dimensionar o card.
                const minLineGapFraction = Math.min(
                  0.3,
                  (LINE_WIDTH_PX + LINE_GAP_PX) / hourWidthPx,
                )
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
                    className={`relative h-6 shrink-0 rounded ${cat ? CAT_BG[cat] : 'bg-surface-2'}`}
                    style={{ width: hourWidthPx }}
                  >
                    {items?.map((item) => {
                      const clamped = positions!.get(item.rec.id)!
                      // Esmaece (não remove) gravações fora do filtro ativo — a régua
                      // sempre mostra TODAS as gravações da hora; `filter` só reduz a
                      // opacidade das que não batem, igual ao card correspondente na
                      // lista lateral (HistoryPage.tsx).
                      const dimmed = filter != null && !matchesTimelineFilter(item.category, filter)
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
              })}
            </div>
            {handleFraction != null && (
              // Ponteiro estilo "lollipop" (bolinha + haste + seta apontando pra baixo, como
              // um ponteiro de relógio) — um único alvo de pointer events (a bolinha, a haste
              // e a seta arrastam juntas). `top`+`bottom` (em vez de uma altura fixa) faz a
              // haste esticar (`flex-1` no meio) pra acompanhar a trilha inteira. `-bottom-2`
              // (em vez de `bottom-0`) desce a ponta da seta um pouco PRA FORA da caixa da
              // trilha (não só encostada na borda) — sem nada abaixo da trilha (os
              // cabeçalhos por card ficam ACIMA dela), essa folga não corre risco de cobrir
              // mais nada. Posição em PIXELS (`timeFractionToPixel`), não porcentagem: o
              // `.relative` que contém a alça (ancestral posicionado mais próximo) nunca
              // cresce além da largura VISÍVEL de `#history-timeline-scroll` (block box
              // comum, largura travada no containing block, mesmo quando os filhos — os
              // cards de hora — transbordam) — `left: X%` resolveria contra essa largura
              // visível, não a do conteúdo real, fazendo a alça flutuar "grudada" numa fração
              // da JANELA em vez da posição real no dia. Diferente do preview (fora do
              // container de scroll), a alça e a linha de hover ficam DENTRO dele — o
              // próprio scroll nativo do navegador já desloca sua posição visual ao rolar,
              // então NÃO subtraem `scrollLeft` (isso duplicaria o deslocamento). `z-20`
              // garante que a alça sempre pinta por cima das linhas verticais da trilha —
              // numa hora bem cheia (muitas linhas vizinhas), a bolinha/haste podiam "sumir"
              // visualmente em meio à quantidade de linhas próximas.
              <div
                id="history-timeline-handle"
                role="button"
                tabIndex={0}
                aria-label="Arrastar para selecionar gravação"
                onPointerDown={handleHandlePointerDown}
                onPointerMove={handleHandlePointerMove}
                onPointerUp={handleHandlePointerUp}
                className="absolute -top-2.5 -bottom-2 z-20 flex -translate-x-1/2 touch-none cursor-grab flex-col items-center active:cursor-grabbing"
                style={{ left: `${timeFractionToPixel(handleFraction, hourWidths, layout)}px` }}
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
                  left: `${timeFractionToPixel(hoverFraction, hourWidths, layout)}px`,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
