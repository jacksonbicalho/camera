import { useEffect, useRef, useState } from 'react'
import { getToken } from '../auth'
import type { Recording } from '../pages/cameraUtils'
import {
  matchesTimelineFilter,
  type RecordingCategory,
  type TimelineFilter,
} from '../pages/eventCategory'
import {
  cardIndexAtPixel,
  computeHourLayout,
  evenFractions,
  hourBoxWidthPx,
  nearestIdByPixel,
} from './timelineScale'

interface RecordingItem {
  rec: Recording
  category: RecordingCategory
}

interface HistoryTimelineProps {
  /** TODAS as gravações do dia (mesmo universo de dados da lista agrupada abaixo — a lista
   * e a régua sempre mostram todas as gravações existentes, nunca um subconjunto: o filtro
   * de categoria não remove nada daqui, só esmaece via `filter` abaixo). */
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
   * nenhuma gravação de `recordingItems`. Omitido = sem esmaecimento (todas as linhas
   * full-opacity) — comportamento retrocompatível pra quem não passar a prop. */
  filter?: TimelineFilter
  /** Dia sendo exibido (qualquer instante dele — só ano/mês/dia local importam). Sem
   * nenhuma gravação, a régua ainda assim aparece (resumo "0 gravações" + trilha vazia)
   * em vez de sumir — só faz sentido informar isso quando o chamador sabe que dia é
   * mesmo sem gravação nenhuma (ex.: HistoryPage sempre tem `selectedDate`). Opcional só
   * para não quebrar chamadores/testes que não têm um "dia" próprio pra passar — nesse
   * caso, sem nenhum item, o componente não renderiza nada (não dá pra saber que dia é). */
  day?: Date
}

// Cor de cada linha vertical — pela categoria REAL da PRÓPRIA gravação (o card de fundo é
// sempre neutro, ver `bg-surface-2` abaixo). Mesmo espírito do protótipo de referência
// (`TimelineHour.tsx`, descartado como código): lá cada linha tinha sua própria cor por
// "tipo"; aqui os "tipos" são as categorias reais do projeto.
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
// tecnicamente presente no DOM. Partiu de 3px (medida do protótipo de referência,
// `TimelineHour.tsx`, descartado como código) — aumentada pra 5px, junto com as demais
// medidas abaixo, a pedido do navigator ("aumente proporcionalmente os cards, linhas e
// espaçamentos"), mantendo a MESMA proporção entre elas (todas escaladas ~1.5-1.6×).
const LINE_WIDTH_PX = 5
// Separação real, em pixels, ENTRE LINHAS VIZINHAS — cada linha ocupa uma fatia igual do
// card por ÍNDICE cronológico (`evenFractions`, timelineScale.ts), então esta margem entra
// direto no cálculo da largura do card (`hourBoxWidthPx`, timelineScale.ts), que reserva
// exatamente o espaço necessário pra caber todas as linhas sem sobrepor.
const LINE_GAP_PX = 2.5
// Gap visível ENTRE os cards de hora (não confundir com `LINE_GAP_PX`, a margem entre
// LINHAS dentro do mesmo card) — cada hora é um card discreto.
const CARD_GAP_PX = 18
// Padding lateral fixo reservado em CADA card, além do espaço ocupado pelas próprias
// linhas.
const CARD_PADDING_PX = 24

function formatClock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// eventFrameURL monta a URL do frame limpo extraído no instante dado — mesmo padrão de
// CameraStatesSettingsPage.tsx.
function eventFrameURL(cameraId: string, ms: number): string {
  return `/api/cameras/${cameraId}/event-frame?time=${encodeURIComponent(new Date(ms).toISOString())}&token=${getToken()}`
}

interface HourCard {
  /** Hora do dia (0-23) que este card representa. */
  hour: number
  items: RecordingItem[]
  /** fração 0..1 de cada gravação por ÍNDICE cronológico (`evenFractions`) — usada tanto
   * pro render (posição em % do card) quanto pra alimentar `linePixelPositions` abaixo. */
  positions: Map<number, number>
  widthPx: number
}

// HistoryTimeline — régua de 24h abaixo do player: um card por hora COM PELO MENOS UMA
// gravação (horas vazias somem — pedido do navigator, ver comentário em `hourCards`
// abaixo), largura própria proporcional à contagem, com um cabeçalho (hora + contagem)
// acima da mini-caixa de linhas — cada linha colorida pela categoria REAL da PRÓPRIA
// gravação (o card de fundo é sempre neutro) — mais um resumo geral (total de gravações)
// e uma alça redonda arrastável pra selecionar uma gravação.
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
  // (determinística, conhecida no 1º render), não de uma medição via ResizeObserver: só
  // precisamos deste ref pra ler `getBoundingClientRect().left` sob demanda nos handlers
  // de clique/arraste (posição do elemento na viewport), nunca pra largura/conteúdo.
  const trackRef = useRef<HTMLDivElement | null>(null)
  // Rola a régua até a linha selecionada entrar em vista — mesmo padrão já usado pela
  // lista lateral de gravações (`activeCardRef`, HistoryPage.tsx), espelhado aqui pro eixo
  // horizontal: pedido do navigator, clicar numa gravação na lista deve trazer a posição
  // correspondente na régua pra dentro da área visível, não deixar o usuário rolando à mão
  // até achar o card certo. `inline: 'nearest'` (equivalente horizontal do `block: 'nearest'`
  // da lista) só move o scroll o mínimo necessário — não pula/centraliza à toa quando a
  // linha já está visível.
  const activeLineRef = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    activeLineRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'nearest',
      block: 'nearest',
    })
  }, [selectedId])
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
  // Todas as posições abaixo são PIXELS absolutos no conteúdo — resolvidas contra
  // `linePixelPositions` (a posição RENDERIZADA de cada linha, por índice via
  // `evenFractions`), nunca contra o horário bruto da gravação. Isso é o que garante que
  // clicar/soltar numa linha específica sempre seleciona a gravação DAQUELA linha, mesmo
  // numa hora muito cheia (bug relatado pelo navigator: clicar numa linha selecionava a
  // gravação vizinha, porque a resolução antiga convertia pixel→horário bruto e achava a
  // gravação mais próxima por HORÁRIO, ignorando a posição visual real).
  //
  // hoverPixel: posição do mouse/arraste, atualizada a cada movimento — move a linha
  // vertical e a alça instantaneamente. previewPixel: debounced — só ela dispara a busca
  // da imagem. dragPixel: posição corrente do arraste (null fora de um arraste); enquanto
  // não-null, é ela (não a posição da gravação selecionada) que a alça segue.
  const [hoverPixel, setHoverPixel] = useState<number | null>(null)
  const [previewPixel, setPreviewPixel] = useState<number | null>(null)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [dragPixel, setDragPixel] = useState<number | null>(null)
  // Posição de repouso da alça (fora de um arraste em andamento) — não é recomputada
  // direto de `selectedId` a cada render: um `pointerup` dentro da MESMA gravação que já
  // estava selecionada não muda `selectedId` (HistoryPage só troca de estado quando o id
  // muda de verdade), então recomputar sempre a partir do início da gravação faria a alça
  // "pular de volta" pro início dela mesmo depois de soltar num ponto mais à frente —
  // parecendo que um arraste pequeno "não fez nada" (queixa relatada). `pointerup` seta
  // esta posição diretamente pro ponto solto; só sincroniza com `selectedId` quando ele
  // muda "de fora" (clique na lista lateral, seleção automática ao trocar de dia).
  const [restingPixel, setRestingPixel] = useState<number | null>(null)
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
  // gravação da categoria naquele dia) — resumo "0 gravações" + trilha vazia, não some.
  if (recordingItems.length === 0 && !day) return null

  const byHour = new Map<number, RecordingItem[]>()
  for (const item of recordingItems) {
    const hour = new Date(item.rec.start).getHours()
    const list = byHour.get(hour)
    if (list) list.push(item)
    else byHour.set(hour, [item])
  }

  // Lista COMPACTA de cards — só as horas com PELO MENOS UMA gravação (pedido do
  // navigator: horas vazias não reservam espaço nenhum na régua, diferente do desenho
  // anterior que sempre mostrava as 24). A largura/posição de cada card, o espaçamento
  // interno das linhas (`evenFractions`) e a posição em pixel de CADA gravação
  // (`linePixelPositions`) são todos derivados desta MESMA lista — um único ponto de
  // verdade, usado tanto pelo render quanto pela resolução de clique/preview (evita as
  // duas ficarem dessincronizadas, causa raiz do bug relatado pelo navigator).
  const hourCards: HourCard[] = []
  for (let hour = 0; hour < 24; hour++) {
    const items = byHour.get(hour)
    if (!items || items.length === 0) continue
    // Sem piso mínimo (`minWidthPx: 0`) — pedido do navigator: um card já FECHADO (não
    // mais recebendo gravações novas) não reserva espaço nenhum além do necessário pras
    // próprias linhas; a largura é sempre exatamente `hourBoxWidthPx` do conteúdo real.
    // Como horas vazias não geram card (ver comentário acima), o conteúdo mínimo possível
    // já é 1 linha — nunca fica "sem nada" mesmo sem piso algum.
    const widthPx = hourBoxWidthPx(items.length, LINE_WIDTH_PX, LINE_GAP_PX, CARD_PADDING_PX, 0)
    // Posição por ÍNDICE cronológico (não por horário real dentro da hora) — pedido do
    // navigator: a PRIMEIRA e a ÚLTIMA linha de todo card devem sempre encostar na mesma
    // distância da borda (o padding lateral, `CARD_PADDING_PX/2`), e o espaçamento entre
    // linhas vizinhas nunca deve variar de forma estranha. Como a LARGURA do card já é só
    // por contagem (não por duração real coberta pelas gravações, ver `hourBoxWidthPx`),
    // posicionar por horário real produzia um artefato: um agrupamento denso de gravações
    // era empurrado pra ocupar mais espaço do que sua fração de tempo "merecia", abrindo um
    // vão visualmente estranho nos trechos mais espaçados (bug relatado pelo navigator).
    // `evenFractions` elimina isso por construção — espaçamento sempre uniforme entre
    // vizinhas, exatamente o suficiente pra caber sem sobrepor (`hourBoxWidthPx` já
    // dimensiona o card para isso). Ordena por horário só pra decidir a ORDEM (esquerda→
    // direita reflete cronologia), não a posição em si.
    const sortedIds = [...items]
      .sort((a, b) => Date.parse(a.rec.start) - Date.parse(b.rec.start))
      .map((item) => item.rec.id)
    const positions = evenFractions(sortedIds)
    hourCards.push({ hour, items, positions, widthPx })
  }
  const cardWidths = hourCards.map((c) => c.widthPx)
  const layout = computeHourLayout(cardWidths, CARD_GAP_PX)
  // Posição em pixel de CADA linha, já recuada pelo padding lateral (`CARD_PADDING_PX/2`
  // de cada lado — o mesmo wrapper interno usado no render, ver JSX abaixo): sem esse
  // recuo, uma linha em frac≈1 (fim da hora) renderizava colada na borda DIREITA do card
  // (a % de posição ia de 0 a 100% da caixa INTEIRA, que já inclui o padding — o padding
  // só aumentava a largura total, nunca reservava margem de verdade) — bug relatado pelo
  // navigator ("a última gravação ficou quase de fora").
  const linePixelPositions = new Map<number, number>()
  hourCards.forEach((card, i) => {
    const contentWidthPx = card.widthPx - CARD_PADDING_PX
    for (const item of card.items) {
      const clamped = card.positions.get(item.rec.id)!
      linePixelPositions.set(
        item.rec.id,
        layout.offsets[i] + CARD_PADDING_PX / 2 + clamped * contentWidthPx,
      )
    }
  })

  function pixelFromClientX(clientX: number): number | null {
    const el = trackRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return null
    // `rect.left` já reflete a posição REAL na viewport (ajustada pelo scroll horizontal
    // de `#history-timeline-scroll` automaticamente, propriedade padrão de
    // `getBoundingClientRect()`) — o pixel relativo ao CONTEÚDO da trilha é só a diferença.
    return clientX - rect.left
  }

  // Só responde a hover/clique/arraste quando o pixel está literalmente EM CIMA de um
  // card — os gaps entre cards e qualquer área além do último não são alvo de interação
  // nenhuma (pedido do navigator: sem isso, mover o mouse além do último card real ainda
  // "grudava" numa posição válida e mostrava um preview flutuando desconectado de
  // qualquer card visível — bug relatado, print em work_progress/amostras/).
  function pixelOverCard(pixelX: number): boolean {
    return cardIndexAtPixel(pixelX, cardWidths, layout) != null
  }

  // Atualiza a posição (linha vertical/alça, instantâneo) e agenda o preview (imagem +
  // horário, debounced) — usado tanto pelo hover na trilha quanto pelo arraste da alça,
  // pra não duplicar a lógica de debounce em dois lugares.
  function updatePosition(pixelX: number) {
    setHoverPixel(pixelX)
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    previewTimerRef.current = setTimeout(() => {
      setPreviewPixel(pixelX)
      setPreviewFailed(false)
    }, PREVIEW_DEBOUNCE_MS)
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (draggingRef.current) return // arraste da alça manda durante o arraste, não o hover
    const px = pixelFromClientX(e.clientX)
    if (px == null || !pixelOverCard(px)) {
      // Fora de qualquer card (num gap ou além das bordas) — mesmo tratamento de sair da
      // trilha (mouseleave): esconde linha de hover e preview.
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
      setHoverPixel(null)
      setPreviewPixel(null)
      return
    }
    updatePosition(px)
  }

  function handleMouseLeave() {
    if (draggingRef.current) return
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    setHoverPixel(null)
    setPreviewPixel(null)
  }

  // Resolve a gravação cuja linha RENDERIZADA está mais próxima de `pixelX` (não a mais
  // próxima por horário bruto — ver comentário de `linePixelPositions`/`nearestIdByPixel`
  // acima) e posiciona a alça — usada tanto pelo clique direto na trilha quanto por
  // soltar o arraste. As linhas verticais (uma por gravação) são os ÚNICOS pontos onde a
  // alça pode "grudar": a posição de repouso sempre vai pra posição RENDERIZADA da
  // gravação encontrada, nunca um ponto livre/contínuo.
  function commitSelection(pixelX: number) {
    const hitId = nearestIdByPixel(linePixelPositions, pixelX)
    if (hitId == null) return
    setRestingPixel(linePixelPositions.get(hitId)!)
    onSelect(hitId)
  }

  function handleClick(e: React.MouseEvent) {
    const px = pixelFromClientX(e.clientX)
    if (px == null || !pixelOverCard(px)) return
    commitSelection(px)
  }

  function handleHandlePointerDown(e: React.PointerEvent) {
    draggingRef.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const px = pixelFromClientX(e.clientX)
    if (px == null || !pixelOverCard(px)) return
    setDragPixel(px)
    updatePosition(px)
  }

  function handleHandlePointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return
    const px = pixelFromClientX(e.clientX)
    // Fora de qualquer card, ignora o movimento (mantém a última posição válida) — não
    // esconde a alça no meio de um arraste (diferente do hover puro), só não avança
    // enquanto o ponteiro estiver sobre um gap.
    if (px == null || !pixelOverCard(px)) return
    setDragPixel(px)
    updatePosition(px)
  }

  function handleHandlePointerUp(e: React.PointerEvent) {
    if (!draggingRef.current) return
    draggingRef.current = false
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    const px = dragPixel
    setDragPixel(null)
    setHoverPixel(null)
    setPreviewPixel(null)
    if (px == null) return
    commitSelection(px)
  }

  // Preview: mostra a gravação mais próxima DENTRO DO CARD sob o cursor (não converte
  // pixel→horário bruto — a mesma razão de `commitSelection` acima: a posição de cada
  // linha é por ÍNDICE, não reflete um horário exato "sob o pixel"). Todo card renderizado
  // TEM pelo menos 1 gravação (horas vazias somem, ver `hourCards` acima), então basta
  // achar o card sob o cursor e a linha mais próxima dentro dele — sempre um resultado
  // válido, sem precisar checar "cobertura" de horário.
  const previewCardIndex =
    previewPixel != null ? cardIndexAtPixel(previewPixel, cardWidths, layout) : null
  const previewCard = previewCardIndex != null ? hourCards[previewCardIndex] : null
  const previewItem =
    previewCard != null && previewPixel != null
      ? previewCard.items.reduce((closest, item) =>
          Math.abs(linePixelPositions.get(item.rec.id)! - previewPixel) <
          Math.abs(linePixelPositions.get(closest.rec.id)! - previewPixel)
            ? item
            : closest,
        )
      : null
  const previewMs = previewItem != null ? Date.parse(previewItem.rec.start) : null

  // Sincroniza `restingPixel` com `selectedId` só quando ele muda "de fora" (clique na
  // lista lateral, seleção automática ao trocar de dia) — ajuste durante o render (mesmo
  // padrão de `errorForId`/`continuousResetForDate` em HistoryPage.tsx), não
  // useEffect+setState. Um clique/soltar do PRÓPRIO timeline já setou `restingPixel`
  // direto (handleClick/handleHandlePointerUp) — não precisa (e não deve) recomputar daqui.
  if (selectedId !== syncedSelectedId) {
    setSyncedSelectedId(selectedId)
    setRestingPixel(selectedId != null ? (linePixelPositions.get(selectedId) ?? null) : null)
  }
  const handlePixel = dragPixel ?? restingPixel

  return (
    <div id="history-timeline" className="mt-1 flex flex-col gap-1">
      <div id="history-timeline-summary" className="text-body text-muted">
        {recordingItems.length} gravações
      </div>
      <div className="relative flex flex-col gap-1">
        {previewMs != null && (
          <div
            id="history-timeline-preview"
            className="pointer-events-none absolute bottom-full z-10 mb-1 flex -translate-x-1/2 flex-col items-center gap-1"
            style={{ left: `${(previewPixel ?? 0) - scrollLeft}px` }}
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
            sempre que a soma dos cards (só as horas com gravação, cada uma proporcional à
            sua contagem) exceder a área visível. `overflow-y-hidden` (não afeta o preview,
            que fica FORA deste container — ver comentário de `scrollLeft` acima) evita uma
            barra vertical indesejada. */}
        <div
          id="history-timeline-scroll"
          // Sem `pt-*` — os CABEÇALHOS são o 1º filho, ocupando naturalmente o espaço
          // logo acima da trilha (onde a bolinha da alça, `-top-2.5`, sobe sem ser
          // cortada por `overflow-y-hidden`). Um padding extra aqui só afastaria o resumo
          // (`#history-timeline-summary`) do restante da régua sem necessidade.
          className="scrollbar-thin overflow-x-auto overflow-y-hidden"
          onScroll={handleTrackScroll}
        >
          {/* Cabeçalho por card (hora + contagem de gravações daquela hora) — cada card de
              hora se descreve por conta própria, acima da própria mini-caixa, no espírito
              do protótipo de referência (`TimelineHour.tsx`, descartado como código).
              Mesmo `gap` da trilha abaixo, e a MESMA largura (proporcional à contagem) por
              coluna, pra cada cabeçalho ficar alinhado exatamente sobre o card
              correspondente. */}
          <div
            id="history-timeline-headers"
            className="flex text-caption text-faint"
            style={{ gap: CARD_GAP_PX }}
          >
            {hourCards.map((card) => (
              <div
                key={card.hour}
                id={`history-timeline-hour-${card.hour}-header`}
                className="shrink-0 truncate text-left"
                style={{ width: card.widthPx }}
              >
                {card.hour}h · {card.items.length}{' '}
                {card.items.length === 1 ? 'gravação' : 'gravações'}
              </div>
            ))}
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
              // Causa raiz real (não é o preflight do Tailwind — é a regra global
              // `[role='button'] { cursor: pointer }` em `styles/base.css`, CSS puro, FORA
              // de qualquer `@layer`): no Tailwind v4, uma regra sem `@layer` sempre vence
              // qualquer classe utilitária (`cursor-default` inclusive), independente de
              // especificidade — então a classe sozinha nunca bastou pra vencer de verdade
              // no navegador (só "funcionava" nos testes, que checam a string da classe,
              // não o cursor computado de fato). `style={{cursor:'default'}}` inline vence
              // qualquer CSS de folha de estilo, camada ou não — única forma confiável de
              // sobrescrever aqui. Sem isso, o cursor de pointer do próprio TRACK (herdado
              // por qualquer filho que não define o seu, como os cards e os gaps entre
              // eles) vazava pra régua inteira. Cada LINHA (span de gravação) define seu
              // próprio `cursor-pointer` puro (sem conflito de camada, não é `role=button`)
              // e continua funcionando normalmente por cima.
              className="flex h-9 cursor-default"
              style={{ gap: CARD_GAP_PX, cursor: 'default' }}
            >
              {hourCards.map((card) => (
                // Card em si sem `cursor-pointer` (pedido do navigator: a "mãozinha" só
                // deve aparecer em cima de uma LINHA de verdade, não em qualquer ponto do
                // card — ver `cursor-pointer` na própria linha abaixo). Card sempre neutro
                // (sem cor por categoria dominante) — cada LINHA dentro dele carrega sua
                // própria cor, ver abaixo.
                <div
                  key={card.hour}
                  id={`history-timeline-hour-${card.hour}`}
                  aria-hidden="true"
                  className="relative h-9 shrink-0 rounded bg-surface-2"
                  style={{ width: card.widthPx }}
                >
                  {/* Wrapper recuado por `CARD_PADDING_PX/2` de CADA lado — as linhas usam
                      % DESTE wrapper (não do card inteiro), então uma linha em frac 0 ou 1
                      (início/fim da hora) fica com a folga do padding, nunca colada na
                      borda do card (bug relatado pelo navigator: "a última gravação ficou
                      quase de fora"). Mesmo recuo usado em `linePixelPositions` acima, pra
                      clique/arraste resolverem exatamente pra onde a linha é desenhada. */}
                  <div
                    className="absolute inset-y-0"
                    style={{ left: CARD_PADDING_PX / 2, right: CARD_PADDING_PX / 2 }}
                  >
                    {card.items.map((item) => {
                      const clamped = card.positions.get(item.rec.id)!
                      // Esmaece (não remove) gravações fora do filtro ativo — a régua
                      // sempre mostra TODAS as gravações da hora; `filter` só reduz a
                      // opacidade das que não batem, igual ao card correspondente na
                      // lista lateral (HistoryPage.tsx). A cor de base é a da PRÓPRIA
                      // categoria da gravação — medidas do protótipo: altura 75% (não
                      // 100%), cantos arredondados, centralizada verticalmente.
                      const dimmed = filter != null && !matchesTimelineFilter(item.category, filter)
                      return (
                        <span
                          key={item.rec.id}
                          id={`history-timeline-hour-${card.hour}-rec-${item.rec.id}`}
                          ref={item.rec.id === selectedId ? activeLineRef : undefined}
                          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-[1px] ${CAT_BG[item.category]} ${dimmed ? 'opacity-40' : ''}`}
                          style={{
                            left: `${clamped * 100}%`,
                            width: LINE_WIDTH_PX,
                            height: '75%',
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            {handlePixel != null && (
              // Ponteiro estilo "lollipop" (bolinha + haste + seta apontando pra baixo, como
              // um ponteiro de relógio) — um único alvo de pointer events (a bolinha, a haste
              // e a seta arrastam juntas). `top`+`bottom` (em vez de uma altura fixa) faz a
              // haste esticar (`flex-1` no meio) pra acompanhar a trilha inteira. `-bottom-2`
              // (em vez de `bottom-0`) desce a ponta da seta um pouco PRA FORA da caixa da
              // trilha (não só encostada na borda) — sem nada abaixo da trilha (os
              // cabeçalhos por card ficam ACIMA dela), essa folga não corre risco de cobrir
              // mais nada. Posição em PIXELS: o `.relative` que contém a alça (ancestral
              // posicionado mais próximo) nunca cresce além da largura VISÍVEL de
              // `#history-timeline-scroll` (block box comum, largura travada no containing
              // block, mesmo quando os filhos — os cards de hora — transbordam) —
              // `left: X%` resolveria contra essa largura visível, não a do conteúdo real,
              // fazendo a alça flutuar "grudada" numa fração da JANELA em vez da posição
              // real no dia. Diferente do preview (fora do container de scroll), a alça e a
              // linha de hover ficam DENTRO dele — o próprio scroll nativo do navegador já
              // desloca sua posição visual ao rolar, então NÃO subtraem `scrollLeft` (isso
              // duplicaria o deslocamento). `z-20` garante que a alça sempre pinta por cima
              // das linhas verticais da trilha — numa hora bem cheia (muitas linhas
              // vizinhas), a bolinha/haste podiam "sumir" visualmente em meio à quantidade
              // de linhas próximas.
              <div
                id="history-timeline-handle"
                role="button"
                tabIndex={0}
                aria-label="Arrastar para selecionar gravação"
                onPointerDown={handleHandlePointerDown}
                onPointerMove={handleHandlePointerMove}
                onPointerUp={handleHandlePointerUp}
                // Mesmo motivo do `cursor: 'default'` inline da trilha acima: a alça
                // também é `role="button"`, então a regra global não-layered de
                // `styles/base.css` (`[role='button']{cursor:pointer}`) vencia tanto
                // `cursor-grab` quanto `active:cursor-grabbing` (utilitários, dentro de
                // `@layer utilities` — perdem pra CSS fora de layer, mesmo com pseudo-classe).
                // Só inline resolve: `grabbing` durante o arraste (`dragPixel != null`,
                // já usado como flag de "arraste em andamento"), `grab` em repouso.
                className="absolute -top-2.5 -bottom-2 z-20 flex -translate-x-1/2 touch-none flex-col items-center"
                style={{
                  left: `${handlePixel}px`,
                  cursor: dragPixel != null ? 'grabbing' : 'grab',
                }}
              >
                {/* Cor NEUTRA (`bg-foreground`, não `bg-primary`) — pedido do navigator:
                    a alça não pode usar uma cor que também apareça numa categoria de
                    gravação (`CAT_BG` acima já usa azul pra "continua", entre outras) — a
                    tonalidade padrão de destaque (`primary`) é azul no tema default, o que
                    confundia a alça com linhas da categoria "continua". Mesmo tratamento
                    neutro já usado pela linha de hover (`bg-foreground/80` abaixo). */}
                <span className="h-3 w-3 shrink-0 rounded-full bg-foreground shadow ring-2 ring-background" />
                <span className="w-1 flex-1 bg-foreground" />
                <span
                  aria-hidden="true"
                  className="h-0 w-0 shrink-0 border-x-8 border-t-8 border-x-transparent border-t-foreground"
                />
              </div>
            )}
            {hoverPixel != null && (
              <div
                className="pointer-events-none absolute top-0 h-9 -translate-x-1/2 bg-foreground/80"
                style={{ width: LINE_WIDTH_PX, left: `${hoverPixel}px` }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
