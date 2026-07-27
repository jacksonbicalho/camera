import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { authHeaders, getToken, onUnauthorized } from '../auth'
import Layout from '../components/Layout'
import CameraStageHeader from '../components/CameraStageHeader'
import DatePicker from '../components/DatePicker'
import { ChevronDown, Loader2, Play } from '../components/Icons'
import VideoPlayer, { type VideoPlayerSegment } from '../components/VideoPlayer'
import HistoryTimeline from '../components/HistoryTimeline'
import TimeRangeFilterPanel from '../components/TimeRangeFilterPanel'
import {
  loadMotionEvents,
  loadRecordingsData,
  mergeRecordings,
  recordingDurationMs,
  type MotionEvent,
  type Recording,
} from './cameraUtils'
import {
  categoryBorderColor,
  categoryLabel,
  matchesTimelineFilter,
  recordingCategory,
  type TimelineFilter,
} from './eventCategory'
import { RecordingsGateway, clipSegments } from '../lib/recordingsGateway'
import { matchesTimeRange, type ClockTime } from '../lib/timeRange'

interface Camera {
  id: string
  name: string
  recording_enabled?: boolean
  // Padding (segundos) usado pro clip de reprodução de um evento — mesmos campos que
  // internal/storage/cleaner.go já usa (e testa) pra computar has_motion. Reaproveitado
  // aqui pra recordingCategory colorir um bloco contíguo de chunks ao redor de um
  // evento, em vez de só o chunk que contém o instante exato dele.
  playback_lead_seconds?: number
  playback_trail_seconds?: number
}

// formatDuration calcula a duração do chunk: usa `end` (fim real) quando presente,
// senão infere pelo início do próximo chunk (mesmo espírito do clipSegments em
// lib/recordingsGateway.ts). Sem próximo chunk (é o último do dia) e sem `end`,
// não há como saber — não mostra badge.
function formatDuration(rec: Recording, next: Recording | undefined): string | null {
  const start = Date.parse(rec.start)
  const endMs = rec.end ? Date.parse(rec.end) : next ? Date.parse(next.start) : NaN
  if (Number.isNaN(start) || Number.isNaN(endMs)) return null
  const totalSec = Math.max(0, Math.round((endMs - start) / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// buildContinuousSequence monta a playlist da reprodução contínua a partir de `id`,
// avançando pra gravações mais NOVAS — não mais antigas. `recs` já vem em ordem
// decrescente (mais recente primeiro, mesma ordem do filmstrip), então "mais novo" =
// índice menor: pega de índice 0 até `id` (inclusive) e inverte, deixando `id` primeiro e
// progredindo em direção à mais recente. Ex.: filmstrip [4,3,2,1] (ids, mais recente
// primeiro) + clique no 2 → toca "2, 3, 4". `id` não encontrado (não deveria acontecer,
// `id` sempre vem de um card do próprio filmstrip) → sequência inteira como fallback.
// filterOptionLabel resolve o texto exibido de uma opção do dropdown de filtro
// (`#history-filter-dropdown`) — `todos`/`continua` são valores fixos do próprio
// TimelineFilter (não vêm de label nenhum, `categoryLabel` não os conhece), qualquer
// categoria real usa `categoryLabel` (mesma capitalização usada em todo o resto do app).
function filterOptionLabel(value: string): string {
  if (value === 'todos') return 'Tudo'
  if (value === 'continua') return 'Contínua'
  return categoryLabel(value)
}

function buildContinuousSequence(recs: Recording[], id: number | null): Recording[] {
  const idx = recs.findIndex((r) => r.id === id)
  const upToSelected = idx >= 0 ? recs.slice(0, idx + 1) : recs
  return [...upToSelected].reverse()
}

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

const gateway = new RecordingsGateway()

// HistoryPage — histórico de gravações da câmera (rota /history/:cameraId ou
// /history/:cameraId/:recordingId). Mostra as gravações do dia selecionado (calendário via
// DatePicker, default hoje): player tocando a selecionada + lista agrupada por hora pra
// trocar de gravação. Cabeçalho compartilhado com LivePage via CameraStageHeader (mesma
// largura).
//
// URL compartilhável: com :recordingId na rota, resolve o dia da gravação via
// RecordingsGateway.getRecording (mesmo endpoint by-id que o VideoBrowserPage usa) e
// pré-seleciona ela — só na carga inicial (initialRecordingId congela o valor da URL no 1º
// render). Daí em diante, selectedId é a fonte de verdade e um efeito dedicado mantém a URL
// sincronizada com ele (troca de card ou seleção automática do 1º do dia), então a barra de
// endereço sempre reflete a gravação em reprodução.
export default function HistoryPage() {
  const { cameraId, recordingId, motionId } = useParams<{
    cameraId: string
    recordingId?: string
    motionId?: string
  }>()
  const navigate = useNavigate()
  const location = useLocation()
  // Congela o :recordingId (e a câmera a que ele pertence) da URL só no 1º render —
  // navegações subsequentes que a própria página disparar (URL sync abaixo, ou o
  // `<select>` de troca de câmera) não devem re-disparar a resolução. Sem
  // `initialCameraId`, trocar de câmera pelo `<select>` reexecutava o efeito abaixo
  // (que só depende de `cameraId`/`initialRecordingId`) tentando resolver o MESMO
  // :recordingId — que pertence à câmera original — contra a câmera nova; quase
  // sempre 404 (`getRecording` é escopado por câmera no backend), disparando
  // "Gravação não encontrada" e resetando a data escolhida sem o usuário ter pedido
  // nenhuma gravação (bug real, achado do code-reviewer).
  const [initialRecordingId] = useState(recordingId)
  const [initialCameraId] = useState(cameraId)
  // :motionId (rota /history/:cameraId/:recordingId/:motionId, ver RecordingPlayerModal)
  // também congela na 1ª renderização — só importa pra decidir a janela inicial do clipe
  // (ver `clipActive`/`resolvedClipSegments` abaixo); nunca é lido de novo depois disso.
  const [initialMotionId] = useState(motionId)
  const pendingSelectRef = useRef<number | null>(null)
  const [camera, setCamera] = useState<Camera | null>(null)
  // Lista completa (não só a câmera ativa) — alimenta o `<select>` de troca de
  // câmera no cabeçalho (mesmo padrão do `report-camera-select` em
  // `ReportsPage`), pedido do navigator: "porque não um dropdown como temos em
  // Relatórios".
  const [cameras, setCameras] = useState<Camera[]>([])
  const [error, setError] = useState<string | null>(null)
  // Gravação da URL (:recordingId) não encontrada — mostrado como overlay no PLAYER (tela preta
  // + mensagem centralizada), não como banner no topo da página: só faz sentido junto do player,
  // que já cai pro dia atual nesse caso (diferente de "Câmera não encontrada", que não tem
  // player nenhum pra mostrar — esse continua no banner `error` do topo).
  const [recordingNotFound, setRecordingNotFound] = useState(false)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [events, setEvents] = useState<MotionEvent[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [videoLoading, setVideoLoading] = useState(true)
  // Alimenta o "pisca" do card ativo no filmstrip (igual ao Filmstrip.tsx legado) — só pisca
  // enquanto o vídeo está de fato tocando, não só "selecionado" (usuário pode pausar).
  const [playing, setPlaying] = useState(true)
  // Sem "onError", uma gravação que falha em carregar (arquivo ausente/corrompido, rede lenta)
  // deixava o spinner de loading girando pra sempre — nunca chegava a "onLoadedData".
  const [videoError, setVideoError] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(() =>
    initialRecordingId ? null : new Date(),
  )
  const [availableDays, setAvailableDays] = useState<string[]>([])
  const [readyForUrlSync, setReadyForUrlSync] = useState(!initialRecordingId)
  const [filter, setFilter] = useState<TimelineFilter>('todos')
  // Filtro de intervalo de horário (painel na coluna lateral, mesma linha do calendário) —
  // filtra AO VIVO: cada edição (onChange) já atualiza este estado direto, sem botão
  // "Aplicar" — matchesTimeRange trata um horário só parcialmente preenchido (from OU to
  // ausente) como "sem filtro" (ver lib/timeRange.ts), então digitar só o "De" ainda não
  // filtra nada até o "Até" também ser preenchido, sem exigir confirmação extra.
  const [timeRange, setTimeRange] = useState<{ from: ClockTime | null; to: ClockTime | null }>({
    from: null,
    to: null,
  })
  // Reprodução contínua: null = desligada; array = ligada, com o snapshot das gravações a
  // encadear (tomado no instante em que liga — ver comentário no `toggleContinuous`).
  const [continuousRecordings, setContinuousRecordings] = useState<Recording[] | null>(null)
  // Modo clipe (`:motionId` na URL) — começa ligado quando a página abre com um motionId
  // (ex.: botão "Visualizar no histórico" do RecordingPlayerModal) e desliga na primeira
  // interação real do usuário (trocar de gravação/dia/câmera, ver `selectRecording` e os
  // handlers do `<select>`/`DatePicker` abaixo) — depois disso o player volta a tocar o
  // chunk inteiro, como sempre. Nunca reativado sozinho.
  const [clipActive, setClipActive] = useState(Boolean(initialMotionId))

  // Resolve o :recordingId da URL (se veio um) pro dia que ele pertence — só na carga
  // inicial, e só pra câmera com que a página montou (`cameraId !== initialCameraId`
  // depois de uma troca pelo `<select>` — ver comentário de `initialCameraId` acima).
  useEffect(() => {
    if (!cameraId || cameraId !== initialCameraId) return
    const targetId = initialRecordingId
    if (!targetId) return
    let cancelled = false
    gateway.getRecording(cameraId, targetId).then((meta) => {
      if (cancelled) return
      if (!meta) {
        setRecordingNotFound(true)
        setSelectedDate(new Date())
        return
      }
      const [y, m, d] = meta.date.split('-').map(Number)
      pendingSelectRef.current = Number(targetId)
      setSelectedDate(new Date(y, m - 1, d))
    })
    return () => {
      cancelled = true
    }
  }, [cameraId, initialRecordingId, initialCameraId])

  // Some sozinho depois de um tempo pro usuário ler — NÃO fica condicionado a nenhum efeito de
  // carregamento terminar (ex.: `camera`/`recordings` resolvendo) porque isso corria risco de
  // limpar o aviso ANTES do player (que só monta com `camera` carregada) sequer ter chance de
  // renderizá-lo uma vez — na prática (fetches reais, ordem de resolução não determinística) o
  // usuário nunca via a mensagem. Um timer próprio garante que, uma vez montado, o overlay fica
  // visível por um tempo fixo independente da corrida entre os outros carregamentos.
  useEffect(() => {
    if (!recordingNotFound) return
    const timer = setTimeout(() => setRecordingNotFound(false), 5_000)
    return () => clearTimeout(timer)
  }, [recordingNotFound])

  useEffect(() => {
    if (!cameraId) return
    let cancelled = false

    async function load() {
      setError(null)
      setCamera(null)
      try {
        const res = await fetch('/api/cameras', { headers: authHeaders() })
        if (res.status === 401) {
          onUnauthorized()
          return
        }
        const data = await res.json()
        if (cancelled) return
        const list = Array.isArray(data) ? (data as Camera[]) : []
        setCameras(list)
        const cam = list.find((c) => c.id === cameraId)
        if (!cam) {
          setError('Câmera não encontrada.')
          return
        }
        setCamera(cam)
      } catch {
        if (!cancelled) setError('Não foi possível carregar a câmera.')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [cameraId])

  useEffect(() => {
    if (!cameraId || !selectedDate) return
    let cancelled = false

    async function load() {
      const pending = pendingSelectRef.current
      const [evs, recRes] = await Promise.all([
        loadMotionEvents(cameraId!, selectedDate!),
        loadRecordingsData(cameraId!, selectedDate!, 1, 'desc', 0),
      ])
      if (cancelled) return
      if (recRes === 401) {
        onUnauthorized()
        return
      }

      const recs = recRes.recordings.filter((r) => !r.is_recording)

      setRecordings(recs)
      setEvents(evs)
      pendingSelectRef.current = null
      const initial =
        pending != null && recs.some((r) => r.id === pending)
          ? pending
          : recs.length > 0
            ? recs[0].id
            : null
      setSelectedId(initial)
      setVideoLoading(true)
      setReadyForUrlSync(true)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [cameraId, selectedDate])

  // Poll pra manter a lista atualizada sem precisar recarregar a página (mesma cadência do
  // CameraPage: 5s pro dia de hoje — chunks novos terminando —, 30s pra dias passados).
  // Rebusca o dia INTEIRO (limit=0, hasMore sempre false) — é a única forma de
  // `mergeRecordings` enxergar uma gravação que foi apagada pelo `storage.Cleaner` em
  // qualquer ponto do dia (não só no fim da janela antes paginada). Nunca mexe em
  // `selectedId`/`videoLoading` — não interrompe a reprodução. `mergeRecordings` devolve a
  // MESMA referência quando nada mudou, evitando remount do <video> à toa.
  useEffect(() => {
    if (!cameraId || !selectedDate) return
    const today = new Date()
    const isToday =
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()

    const interval = setInterval(
      async () => {
        const [recRes, evs] = await Promise.all([
          loadRecordingsData(cameraId, selectedDate, 1, 'desc', 0),
          loadMotionEvents(cameraId, selectedDate),
        ])
        if (recRes === 401) {
          onUnauthorized()
          return
        }
        const recs = recRes.recordings.filter((r) => !r.is_recording)
        setRecordings((prev) => mergeRecordings(prev, recs, 'desc', false))
        setEvents(evs)
      },
      isToday ? 5_000 : 30_000,
    )

    return () => clearInterval(interval)
  }, [cameraId, selectedDate])

  // Dias com gravação ou evento — o calendário só habilita esses.
  useEffect(() => {
    if (!cameraId) return
    fetch(`/api/cameras/${cameraId}/content-days`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { days: [] }))
      .then((d: { days?: string[] }) => setAvailableDays(d.days ?? []))
      .catch(() => {})
  }, [cameraId])

  // Mantém a URL sincronizada com selectedId (troca manual de card ou seleção automática) —
  // sempre que uma gravação está em reprodução, a barra de endereço reflete ela e vira
  // compartilhável. Só entra em ação depois da resolução inicial (readyForUrlSync) pra não
  // reescrever uma URL compartilhada antes dela ser resolvida.
  useEffect(() => {
    if (!cameraId || !readyForUrlSync) return
    const target =
      selectedId != null ? `/history/${cameraId}/${selectedId}` : `/history/${cameraId}`
    if (location.pathname !== target) navigate(target, { replace: true })
  }, [cameraId, selectedId, readyForUrlSync, location.pathname, navigate])

  // A gravação selecionada pode sumir de `recordings` sem nenhuma ação do usuário — o poll
  // removeu ela porque o storage.Cleaner apagou o arquivo (mergeRecordings). Sem essa correção,
  // `selected` virava null e o player caía em "Sem gravações nesse dia" mesmo com outras
  // gravações do dia ainda disponíveis; troca pra mais recente ainda existente. Ajuste durante o
  // render (mesmo padrão do `playingForId` abaixo), não useEffect+setState.
  if (selectedId != null && recordings.length > 0 && !recordings.some((r) => r.id === selectedId)) {
    setSelectedId(recordings[0].id)
    setVideoLoading(true)
  }

  const selected = useMemo(
    () => recordings.find((r) => r.id === selectedId) ?? null,
    [recordings, selectedId],
  )

  // `recordings` já vem em ordem decrescente (mais recente primeiro). O "próximo cronológico"
  // (pra inferir a duração quando `end` não veio) de um item no índice `i` é o índice ANTERIOR
  // (`i - 1`), mais recente nessa ordem — o mais recente de todos (índice 0) não tem "próximo".
  // `recordingItems` carrega duração + categoria de cada item (pro filtro e pra lista agrupada).
  // O padding lead/trail (default 10s/10s, mesmo default de RecordingsGateway.getPlaybackWindow)
  // alarga a janela de contenção de recordingCategory pros dois lados de um evento — sem ele, só
  // o chunk que contém o instante exato do evento seria colorido, mesmo a pessoa ainda visível
  // nos chunks vizinhos.
  const recordingItems = useMemo(() => {
    const padding = {
      leadMs: (camera?.playback_lead_seconds ?? 10) * 1000,
      trailMs: (camera?.playback_trail_seconds ?? 10) * 1000,
    }
    return recordings.map((rec, i) => ({
      rec,
      duration: formatDuration(rec, recordings[i - 1]),
      category: recordingCategory(
        rec,
        events,
        recordingDurationMs(rec, recordings[i - 1]),
        padding,
      ),
    }))
  }, [recordings, events, camera])
  // Opções do dropdown de filtro (`#history-filter-dropdown`) — dinâmicas, derivadas das
  // categorias que de fato aparecem nas gravações do dia carregado (pedido do navigator:
  // nada de chips fixos hardcoded pra categorias que nem existem no dia). `todos` sempre
  // primeiro, `continua` sempre por último (não vem de label nenhum — é a ausência de
  // evento no chunk, sempre uma opção válida mesmo sem NENHUMA gravação "continua" ainda);
  // entre as duas pontas, as categorias reais presentes, ordenadas: pessoa primeiro,
  // movimento depois, resto em ordem alfabética (mesma prioridade de `recordingCategory`).
  const filterOptions = useMemo(() => {
    const present = new Set<string>()
    for (const item of recordingItems) {
      if (item.category !== 'continua') present.add(item.category)
    }
    const rank = (cat: string) => (cat === 'pessoa' ? 0 : cat === 'movimento' ? 1 : 2)
    const dynamic = [...present].sort((a, b) => {
      const diff = rank(a) - rank(b)
      return diff !== 0 ? diff : a.localeCompare(b)
    })
    return ['todos', ...dynamic, 'continua']
  }, [recordingItems])
  // O filtro ativo pode deixar de existir entre um dia e outro (as opções são dinâmicas,
  // por dia) ou entre um poll e outro (se a categoria que estava selecionada não aparecer
  // mais nas gravações atuais) — ajuste durante o render (mesmo padrão de
  // `continuousResetForDate` abaixo, não useEffect+setState). Sem isso, o `<select>` caía
  // sozinho pra "Tudo" no DOM (nenhuma `<option>` bate o `value` antigo, comportamento
  // padrão do HTML), mas o estado React continuava com o filtro antigo — o dropdown
  // MENTIA sobre o filtro ativo: mostrava "Tudo" enquanto `matchesTimelineFilter` seguia
  // aplicando a categoria antiga, esmaecendo TUDO sem explicação visível (bug relatado
  // pelo code-reviewer).
  if (!filterOptions.includes(filter)) {
    setFilter('todos')
  }
  // Filtro de intervalo de horário (De/Até, painel na coluna lateral) — aplicado ANTES do
  // filtro de categoria, sobre `recordingItems` (o mesmo universo que `filterOptions` usa —
  // as opções do dropdown não mudam com o range de horário, mesmo precedente de já não
  // mudarem com o filtro de categoria ativo). Sem `timeRange.from/to` (nenhum dos dois
  // preenchido ainda), `matchesTimeRange` sempre casa — equivalente a "sem filtro".
  const timeFilteredItems = useMemo(
    () =>
      recordingItems.filter((item) =>
        matchesTimeRange(item.rec.start, timeRange.from, timeRange.to),
      ),
    [recordingItems, timeRange],
  )
  // Agrupa por hora local (0-23) do início da gravação — cada grupo é colapsável, com
  // contagem no cabeçalho ("18h — 12 gravações"). A ordem dos grupos (desc) e dos itens
  // dentro de cada grupo (desc) segue a mesma ordem de `recordings`. Deriva dos itens que
  // batem com o filtro ativo (`matchesTimelineFilter`) sobre `timeFilteredItems` (os dois
  // filtros combinam por E lógico) — hora sem nenhum item correspondente não gera grupo
  // nenhum (some inteira, não só esmaece). Reprodução contínua continua usando
  // `recordings` (a lista completa, sem filtro nenhum) — inalterado.
  const groupsByHour = useMemo(() => {
    const map = new Map<number, typeof recordingItems>()
    for (const item of timeFilteredItems) {
      if (!matchesTimelineFilter(item.category, filter)) continue
      const hour = new Date(item.rec.start).getHours()
      const list = map.get(hour)
      if (list) list.push(item)
      else map.set(hour, [item])
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  }, [timeFilteredItems, filter])

  // Grupos COLAPSADOS (o padrão é todo mundo aberto — dia normal de câmera residencial tem
  // poucas horas com conteúdo; abrir tudo por padrão favorece escanear a lista inteira,
  // igual ao filmstrip plano de antes, e ainda permite recolher horas que não interessam).
  // Um grupo fechado reabre sozinho se o item ativo MUDAR pra ele (clique num card,
  // deep-link da URL, avanço da reprodução contínua) — nunca esconde o item em reprodução.
  const [closedHours, setClosedHours] = useState<Set<number>>(new Set())
  const activeHour = selected ? new Date(selected.start).getHours() : null
  // Ajuste durante o render (mesmo padrão de `errorForId`/`continuousResetForDate` abaixo),
  // não useEffect+setState — mas só reabre quando `activeHour` de fato MUDA (comparado
  // contra `syncedActiveHour`, sincronizado só nesse momento), nunca a cada render. Sem
  // esse guard de mudança, fechar manualmente o grupo do item JÁ ativo (ex.: a hora mais
  // recente, selecionada por padrão) reabria sozinho no próximo render — o clique no
  // colapsar nunca "pegava" pra esse grupo específico (bug relatado pelo navigator: "a
  // primeira hora eu não consigo fechar").
  const [syncedActiveHour, setSyncedActiveHour] = useState(activeHour)
  if (activeHour !== syncedActiveHour) {
    setSyncedActiveHour(activeHour)
    if (activeHour != null && closedHours.has(activeHour)) {
      const next = new Set(closedHours)
      next.delete(activeHour)
      setClosedHours(next)
    }
  }
  // `closedHours` guarda números de HORA (0-23), reaproveitados entre câmeras
  // distintas — sem resetar ao trocar de câmera pelo `<select>` do cabeçalho, um
  // grupo fechado manualmente numa câmera nasceria fechado sem motivo na próxima
  // (mesmo padrão de ajuste-durante-o-render de `continuousResetFor` abaixo).
  const [closedHoursResetForCamera, setClosedHoursResetForCamera] = useState(cameraId)
  if (cameraId !== closedHoursResetForCamera) {
    setClosedHoursResetForCamera(cameraId)
    setClosedHours(new Set())
  }
  function toggleHour(hour: number) {
    setClosedHours((prev) => {
      const next = new Set(prev)
      if (next.has(hour)) next.delete(hour)
      else next.add(hour)
      return next
    })
  }

  // Rola a lista até o item ativo entrar em vista — sobretudo importante ao abrir a URL
  // compartilhável de uma gravação específica (/history/:cameraId/:recordingId).
  const activeCardRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    activeCardRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    })
  }, [selectedId])

  // Altura do sidebar (`history-recordings-list`) ATÉ o fundo de `history-main` (o player) —
  // pedido do navigator. `align-items: stretch` do CSS não resolve isso sozinho: sem uma
  // altura EXTERNA de referência (nem `history-content` nem a linha têm altura própria,
  // ambas são "auto" de baixo pra cima), o algoritmo de flexbox usa o MAIOR conteúdo
  // hipotético entre os dois irmãos pra decidir a altura da linha — com uma lista longa de
  // gravações, o sidebar vira o maior, e stretch infla `history-main` (e o `h-full` interno
  // do VideoPlayer) até o tamanho do sidebar, abrindo um vão vazio abaixo do rodapé do
  // player (bug real, visto no navegador). `ResizeObserver` mede a altura
  // renderizada de `history-main` e vira o teto (`maxHeight`) do sidebar via `overflow-hidden`
  // + o miolo rolável (`history-recordings-groups`) com `min-h-0` — isso quebra o ciclo:
  // `history-main` nunca mais depende do sidebar (a linha usa `items-start`, sem stretch), só
  // o sidebar depende de `history-main`. `ResizeObserver` não existe no jsdom (testes) —
  // degrada graciosamente pra sem teto (`mainHeight` fica `null`).
  //
  // Ref CALLBACK, não useRef+useEffect(deps: []) — `history-main` só monta depois que
  // `camera` carrega (fetch assíncrono), então um useEffect de deps vazias rodaria ANTES do
  // node existir (mainRef.current ainda null no 1º render) e nunca mais tentaria de novo —
  // bug real, visto: `mainHeight` ficava `null` pra sempre, sidebar sem teto nenhum. Um ref
  // callback dispara toda vez que o node MUDA (attach/detach), inclusive quando ele passa a
  // existir num render posterior.
  const [mainHeight, setMainHeight] = useState<number | null>(null)
  const mainObserverRef = useRef<ResizeObserver | null>(null)
  // Node de `history-main` guardado à parte (além do ResizeObserver acima) — usado por
  // `recomputeRowWidth` abaixo pra medir a borda esquerda de verdade via
  // `getBoundingClientRect()`, sem alterar em nada o próprio sizing do player (`flex-1`,
  // que precisa continuar crescendo normalmente até preencher o espaço disponível).
  const mainNodeRef = useRef<HTMLDivElement | null>(null)
  // Sidebar (`history-recordings-list`) — condicionada a `selectedDate`, então pode
  // desmontar/remontar (recalcula sozinho, ref callback dispara com `null` no unmount).
  // Declarado ANTES de `recomputeRowWidth` (que o lê) — mesma ordem de `mainNodeRef`
  // acima, exigida pelo eslint-plugin-react-hooks (react-hooks/immutability).
  const sidebarNodeRef = useRef<HTMLDivElement | null>(null)
  const sidebarObserverRef = useRef<ResizeObserver | null>(null)

  // Largura da RÉGUA de 24h (fica FORA da linha player+lista, abaixo dela) — precisa
  // ocupar exatamente da borda esquerda do player até a borda direita da lista (pedido do
  // navigator, com referência visual em work_progress/amostras/limite-timeline.png: a
  // régua não pode vazar pra fora desses limites). PRIMEIRA tentativa (revertida): forçar
  // a linha player+lista a `width: fit-content` (`w-fit`) pra poder medir a própria linha
  // via ResizeObserver — só que um container flex com `fit-content` NÃO distribui espaço
  // livre pros filhos `flex-grow` (não há "sobra" quando o próprio container se
  // autoajusta ao conteúdo): `history-main` (`flex-1 lg:max-w-[72rem]`) colapsava pro
  // tamanho do conteúdo intrínseco mais largo em vez de crescer até 72rem — regressão
  // visual severa (o player inteiro encolhia), pega no code review e confirmada pelo
  // navigator ("você diminuiu tudo"). Solução: NÃO tocar no sizing de `history-main`/
  // sidebar — medir a posição RENDERIZADA de cada um via `getBoundingClientRect()`
  // (borda esquerda do player, borda direita da lista) e calcular a diferença. Um
  // `ResizeObserver` só dispara quando o próprio elemento observado muda de tamanho, não
  // quando um IRMÃO aparece/desaparece (ex.: a lista sendo condicionada a `selectedDate`)
  // — por isso observa os DOIS nodes (main e sidebar), recalculando a cada disparo de
  // qualquer um.
  const [rowWidth, setRowWidth] = useState<number | null>(null)
  const recomputeRowWidth = useCallback(() => {
    const mainEl = mainNodeRef.current
    if (!mainEl) return
    const mainRect = mainEl.getBoundingClientRect()
    const sidebarEl = sidebarNodeRef.current
    const rightEdge = sidebarEl ? sidebarEl.getBoundingClientRect().right : mainRect.right
    setRowWidth(rightEdge - mainRect.left)
  }, [])
  const mainRef = useCallback(
    (el: HTMLDivElement | null) => {
      mainNodeRef.current = el
      mainObserverRef.current?.disconnect()
      mainObserverRef.current = null
      if (!el || typeof ResizeObserver === 'undefined') return
      const observer = new ResizeObserver((entries) => {
        const height = entries[0]?.contentRect.height
        if (height != null) setMainHeight(height)
        recomputeRowWidth()
      })
      observer.observe(el)
      mainObserverRef.current = observer
    },
    [recomputeRowWidth],
  )
  const sidebarRef = useCallback(
    (el: HTMLDivElement | null) => {
      sidebarNodeRef.current = el
      sidebarObserverRef.current?.disconnect()
      sidebarObserverRef.current = null
      if (!el || typeof ResizeObserver === 'undefined') {
        recomputeRowWidth()
        return
      }
      const observer = new ResizeObserver(() => recomputeRowWidth())
      observer.observe(el)
      sidebarObserverRef.current = observer
    },
    [recomputeRowWidth],
  )

  // singleSegments: 1 gravação = 1 segmento (modo normal, troca manual de card) —
  // referência estável (useMemo) enquanto `selected` não muda. continuousSegments: a
  // playlist inteira do modo contínuo — referência estável enquanto `continuousRecordings`
  // não muda (ou seja, enquanto o toggle não é ligado/desligado de novo). `segments` escolhe
  // qual delas repassar pro VideoPlayer. Separar os dois memos (em vez de um só dependendo
  // de `selected` e `continuousRecordings` juntos) é o que garante que avançar de segmento
  // durante a reprodução contínua (que atualiza `selectedId` via `onSegmentChange` abaixo)
  // NÃO reconstrói a playlist a cada passo — senão o motor do VideoPlayer reiniciaria do
  // zero (perde o double-buffering) a cada transição, o oposto do que a feature pede.
  const singleSegments = useMemo<VideoPlayerSegment[]>(
    () =>
      selected
        ? [
            {
              src: `${selected.url}?token=${getToken()}`,
              fromSeconds: 0,
              toSeconds: Infinity,
            },
          ]
        : [],
    [selected],
  )
  // toSeconds do modo contínuo usa a duração REAL do registro (`end - start`, mesmo cálculo
  // de `formatDuration`) em vez de `Infinity` — isso faz a transição entre gravações passar
  // pelo mesmo caminho (onTimeUpdate cruzando `toSeconds`) já comprovado pelos clipes de
  // evento do VideoBrowserPage, em vez de depender só do evento nativo `ended` do <video>
  // (caminho novo, nunca exercitado em produção antes desta história — gravações reais não
  // fragmentadas podem não disparar `ended` de forma confiável). Sem `end` (não deveria
  // acontecer aqui — `is_recording` já é filtrado antes de chegar em `recordings`), cai pra
  // `Infinity` como rede de segurança.
  const continuousSegments = useMemo<VideoPlayerSegment[]>(
    () =>
      continuousRecordings
        ? continuousRecordings.map((rec) => {
            const start = Date.parse(rec.start)
            const end = rec.end ? Date.parse(rec.end) : NaN
            const toSeconds =
              Number.isFinite(start) && Number.isFinite(end)
                ? Math.max(0, (end - start) / 1000)
                : Infinity
            return {
              src: `${rec.url}?token=${getToken()}`,
              fromSeconds: 0,
              toSeconds,
            }
          })
        : [],
    [continuousRecordings],
  )
  // resolvedClipSegments — janela `[evento−lead, evento+trail]` recortada via `clipSegments`
  // (lib/recordingsGateway.ts, MESMA função que `/recording/:cameraId/:recordingId/:motionId`
  // — VideoBrowserPage/useRecordingSegments — já usa), resolvida UMA VEZ e congelada. Ajuste
  // durante o render (não useEffect+setState — mesmo padrão de `errorForId`/
  // `continuousResetFor` já usados nesta página): computa e grava assim que `events`/
  // `recordings` do dia E `camera` (fetch de `/api/cameras`, efeito independente — sem
  // isso o guard congelava usando o lead/trail DEFAULT (10s/10s) se `/api/cameras` ainda
  // não tivesse resolvido, mesmo a câmera tendo `playback_lead_seconds`/`trail_seconds`
  // configurados — e nunca recalculava depois, achado real do code review) carregam, e
  // nunca mais recalcula depois disso.
  //
  // Congelar é essencial, não só estilo: `recordings` troca de REFERÊNCIA a cada poll (5s/30s,
  // ver efeito acima) sempre que a gravação em andamento avança (`is_recording`/`end`
  // mudando) — se `resolvedClipSegments` fosse um useMemo dependendo de `recordings` (como
  // `clipEvent` originalmente era), cada poll geraria um array de segmentos NOVO, e o
  // `useEffect` do VideoPlayer (que reinicia a reprodução — `startPlayback` — sempre que a
  // referência de `segments` muda) reiniciaria o clipe do zero a cada poll: o vídeo "ficava
  // repetindo" sozinho, sem o usuário ter feito nada (bug real, reportado pelo navigator).
  // `singleSegments`/`continuousSegments` acima não sofrem disso porque dependem de `selected`/
  // `continuousRecordings` — já estáveis por construção — nunca da array `recordings` crua.
  const [resolvedClipSegments, setResolvedClipSegments] = useState<VideoPlayerSegment[] | null>(
    null,
  )
  if (clipActive && resolvedClipSegments == null && recordings.length > 0 && camera != null) {
    const ev = events.find((e) => String(e.id) === initialMotionId)
    if (ev) {
      const leadSec = camera.playback_lead_seconds ?? 10
      const trailSec = camera.playback_trail_seconds ?? 10
      setResolvedClipSegments(
        clipSegments(ev.time, recordings, leadSec, trailSec).map((s) => ({
          src: `${s.recording.url}?token=${getToken()}`,
          fromSeconds: s.fromSeconds,
          toSeconds: s.toSeconds,
        })),
      )
    }
  }
  // Prioridade: contínua > clipe (só enquanto `clipActive` — sai do modo, mesmo com um
  // clipe já congelado em `resolvedClipSegments`, cai pro chunk inteiro) > gravação única.
  // Sem sobreposição real (ex.: a gravação-alvo sumiu do dia, `resolvedClipSegments` congela
  // vazio) cai pro chunk inteiro normal também, em vez de mostrar o player vazio.
  const segments = continuousRecordings
    ? continuousSegments
    : clipActive && resolvedClipSegments && resolvedClipSegments.length > 0
      ? resolvedClipSegments
      : singleSegments

  // onSegmentChange (VideoPlayer) dispara com o índice do segmento ativo a cada transição —
  // mapeia de volta pro id da gravação via ref (callback com deps vazias = identidade
  // estável; se não fosse estável, mudaria a cada render de HistoryPage e isso cascatearia
  // pro VideoPlayer reiniciar o motor à toa, ver comentário do efeito de `segments` em
  // VideoPlayer.tsx). `useLayoutEffect`, não `useEffect`: o VideoPlayer é filho e roda seus
  // PASSIVE effects (useEffect) só depois que TODOS os layout effects (useLayoutEffect) da
  // árvore — filhos E pais — já comitaram (React sincroniza a fase de layout inteira antes
  // de agendar a fase passiva); um `useEffect` aqui rodaria como passive effect, na mesma
  // fase e DEPOIS do passive effect do VideoPlayer que troca de segmento (React descarrega
  // effects de baixo pra cima dentro da MESMA fase) — o ref ficava um render atrasado quando
  // lido por aquele efeito, mapeando de volta pra gravação errada e revertendo a troca: loop
  // de render que só aparecia ao clicar num card, nunca na carga inicial. `useLayoutEffect`
  // termina antes da fase passiva começar, garantindo o ref fresco a tempo.
  const activeRecordingsRef = useRef<Recording[]>([])
  useLayoutEffect(() => {
    activeRecordingsRef.current = continuousRecordings ?? (selected ? [selected] : [])
  })
  const handleSegmentChange = useCallback((index: number) => {
    const rec = activeRecordingsRef.current[index]
    if (rec) setSelectedId((id) => (id === rec.id ? id : rec.id))
  }, [])

  // videoError não pode grudar na gravação seguinte — reseta ao trocar. `playing` já é
  // resolvido pelo próprio VideoPlayer (onPlayingChange dispara true de cara, assumindo
  // autoplay, até "onPause" provar o contrário). Ajuste durante o render (não
  // useEffect+setState — dispararia um render extra e o eslint react-hooks/set-state-in-effect
  // barra esse padrão), mesmo truque do CameraViewTabs.
  const [errorForId, setErrorForId] = useState(selectedId)
  if (selectedId !== errorForId) {
    setErrorForId(selectedId)
    setVideoError(false)
  }

  // Reprodução contínua não atravessa a troca de dia NEM a troca de câmera pelo
  // `<select>` do cabeçalho (o snapshot de gravações é de UMA câmera específica) —
  // reseta ao trocar qualquer um dos dois (mesmo padrão de ajuste-durante-o-render
  // usado acima, não useEffect+setState).
  const [continuousResetFor, setContinuousResetFor] = useState({ cameraId, selectedDate })
  if (
    cameraId !== continuousResetFor.cameraId ||
    selectedDate !== continuousResetFor.selectedDate
  ) {
    setContinuousResetFor({ cameraId, selectedDate })
    setContinuousRecordings(null)
  }

  function selectRecording(id: number) {
    // Clicar em QUALQUER card (mesmo o já ativo, cuja janela de clipe pode estar tocando)
    // é uma interação real do usuário — sai do modo clipe, mesmo sem trocar de gravação
    // (escape hatch pra ver o chunk inteiro sem precisar trocar de dia/câmera).
    setClipActive(false)
    const switching = id !== selectedId
    // Com o modo contínuo ligado, clicar num item RE-ANCORA a sequência nele (mantém
    // ligado) em vez de desligar — é assim que se pula pra outro ponto do dia sem sair do
    // modo: a partir de agora encadeia as mais novas que `id`, na ordem "id, id+1, id+2...".
    if (continuousRecordings != null) {
      setContinuousRecordings(buildContinuousSequence(recordings, id))
    }
    if (!switching) return
    setSelectedId(id)
    setVideoLoading(true)
  }

  // Liga: encadeia a partir da gravação selecionada em direção às mais NOVAS (ver
  // `buildContinuousSequence`). Desliga: volta pro clipe único da gravação que estiver
  // tocando no momento. Em ambos os casos o motor do VideoPlayer reinicia do zero (troca de
  // referência de `segments`) — reinício simples e previsível, sem tentar preservar a
  // posição exata na troca de modo.
  function toggleContinuous() {
    setClipActive(false)
    setContinuousRecordings((prev) =>
      prev ? null : buildContinuousSequence(recordings, selectedId),
    )
  }

  return (
    <Layout id="history-page" footerId="history-footer" contentClassName="p-6">
      {/* `.page-content` — mesmo padrão fluido (sem max-width) de todas as outras páginas,
          inclusive Live View (ver CLAUDE.md "Largura do conteúdo"). Layout de duas colunas
          continua: player à esquerda (`history-main`, flex-1 — cresce até preencher o
          espaço restante, sem cap), lista de gravações à direita (`history-recordings-list`,
          largura fixa). Empilha em coluna única abaixo do breakpoint `lg`.
          O título (`history-header`, dentro do `CameraStageHeader`) fica FORA da linha de
          duas colunas — só o `children` do `CameraStageHeader` (o `<div>` logo abaixo) entra
          nela — pra que o TOPO do sidebar (`history-recordings-list`) alinhe com o topo do
          PLAYER, não com o topo do título. */}
      <div id="history-content" className="page-content flex w-full flex-col gap-3">
        {error && (
          <div
            id="history-error"
            className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-body text-danger"
          >
            {error}
          </div>
        )}
        {camera && (
          <CameraStageHeader
            idPrefix="history"
            cameraName={camera.name}
            recordingEnabled={camera.recording_enabled}
            pageTitle="Histórico"
            actions={
              cameras.length > 1 ? (
                <select
                  id="history-camera-select"
                  value={cameraId}
                  onChange={(e) => {
                    setClipActive(false)
                    navigate(`/history/${e.target.value}`)
                  }}
                  className="bg-surface-2 text-foreground text-xs rounded px-2 py-1 border border-border max-w-44"
                >
                  {cameras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : undefined
            }
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              <div ref={mainRef} id="history-main" className="flex min-w-0 flex-1 flex-col gap-2">
                <VideoPlayer
                  idPrefix="history-player"
                  segments={segments}
                  // O contador "N / M" é específico do clipe de UM evento (VideoBrowserPage,
                  // `:motionId` explícito na URL) — no Histórico, mesmo com >1 segmento (modo
                  // contínuo), "N / M" não corresponde a nada que o usuário reconheça (não é
                  // "parte 2 de 5 de UMA gravação", é "a 2ª de 5 gravações distintas na lista").
                  segmentCounter={false}
                  // Tela cheia entre velocidade e reprodução contínua (não no fim da linha, como
                  // no VideoBrowserPage) — pedido do navigator, específico do Histórico.
                  fullscreenPosition="afterSpeed"
                  emptyMessage="Sem gravações nesse dia."
                  onLoadedData={() => setVideoLoading(false)}
                  onError={() => {
                    setVideoLoading(false)
                    setVideoError(true)
                  }}
                  onPlayingChange={setPlaying}
                  onSegmentChange={handleSegmentChange}
                  footerExtra={
                    <>
                      <button
                        id="history-continuous-toggle"
                        type="button"
                        role="switch"
                        onClick={toggleContinuous}
                        disabled={recordings.length === 0}
                        aria-checked={continuousRecordings != null}
                        className="flex items-center gap-1.5 disabled:opacity-40"
                      >
                        <span
                          className={`inline-flex h-5 w-14 shrink-0 items-center rounded-full border-2 transition-colors ${
                            continuousRecordings != null
                              ? 'justify-end border-primary'
                              : 'justify-start border-faint'
                          }`}
                        >
                          <span
                            className={`-my-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-background transition-colors ${
                              continuousRecordings != null
                                ? 'border-primary text-primary'
                                : 'border-faint text-faint'
                            }`}
                          >
                            <Play className="ml-0.5 h-3 w-3" />
                          </span>
                        </span>
                        <span
                          className={`whitespace-nowrap text-caption font-medium transition-colors ${
                            continuousRecordings != null ? 'text-primary' : 'text-faint'
                          }`}
                        >
                          Reprodução contínua
                        </span>
                      </button>
                      {/* Divisor explícito (não `divide-x`) — o reset de borda do <button> zera
                      `border-left-width` do utilitário `divide-x`, então ele não aparecia. */}
                      <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
                    </>
                  }
                  overlay={
                    <>
                      {videoError ? (
                        <div
                          id="history-player-error"
                          className="absolute inset-0 flex items-center justify-center bg-black/70 text-body text-danger"
                        >
                          Não foi possível carregar a gravação.
                        </div>
                      ) : (
                        videoLoading && (
                          <div
                            id="history-player-loading"
                            className="absolute inset-0 flex items-center justify-center bg-black/70"
                          >
                            <Loader2 className="h-8 w-8 animate-spin text-white/70" />
                          </div>
                        )
                      )}
                      {recordingNotFound && (
                        // Overlay (não um branch exclusivo do ternário acima): assim, uma vez
                        // montado, é exibido garantidamente por cima do que já estiver no player
                        // (vídeo ou "Sem gravações"), independente de qual carregamento
                        // (câmera/gravações) terminou primeiro — ver comentário no useEffect do
                        // timer de dismiss.
                        <div
                          id="history-recording-not-found"
                          className="absolute inset-0 flex items-center justify-center bg-black text-body text-danger"
                        >
                          Gravação não encontrada.
                        </div>
                      )}
                    </>
                  }
                />
              </div>
              {/* Sidebar — sibling de `history-main` dentro da MESMA linha; por estar dentro
                do `children` do `CameraStageHeader` junto com `history-main`, o topo alinha
                com o topo do PLAYER (o título fica fora dessa linha — ver comentário acima).
                Largura fixa (`lg:w-80`) + `lg:shrink-0`; a altura vem do `mainHeight` medido
                via ResizeObserver (ver comentário acima) — como `history-main` termina no
                rodapé do player, o sidebar se estica até ali. Visível sempre que
                `camera && selectedDate` (NÃO `recordingItems.length > 0`) — o calendário
                precisa continuar acessível MESMO num dia sem gravação nenhuma, pra dar pro
                usuário trocar de dia; só os chips de filtro (sem sentido sem nada pra
                filtrar) e a lista ficam condicionados a `recordingItems.length > 0` dentro do
                box. */}
              {selectedDate && (
                <div
                  ref={sidebarRef}
                  id="history-recordings-list"
                  className="flex w-full flex-col gap-1.5 overflow-hidden rounded-lg border border-border lg:w-80 lg:shrink-0"
                  style={mainHeight != null ? { maxHeight: mainHeight } : undefined}
                >
                  {/* Corpo do sidebar (calendário + filtro de horário + dropdown de categoria +
                      lista) — único lugar com padding lateral (`px-2`), inclusive o calendário:
                      ele é mais um FILHO deste container, não um irmão de fora — assim a borda
                      do botão-gatilho do `DatePicker` (`fullWidth`, mede via
                      `getBoundingClientRect()`, ver `DatePicker.tsx`) fica alinhada com a borda
                      do dropdown/cards logo abaixo (mesmo recuo de `px-2` pros três), que é o
                      que "alinhado com a lista de gravações" significa de fato (pedido do
                      navigator, testado contra a página real) — não a borda externa da caixa
                      inteira. `flex-1 min-h-0` repassa a mesma mecânica de altura que
                      `history-recordings-list` tinha antes (necessária pro `min-h-0 flex-1` de
                      `history-recordings-groups` abaixo continuar rolando dentro do teto medido
                      via ResizeObserver). */}
                  <div
                    id="history-recordings-body"
                    className="flex min-h-0 flex-1 flex-col gap-1.5 px-2 pb-2"
                  >
                    <div className="flex w-full items-center pt-2">
                      <DatePicker
                        id="history-date-picker"
                        value={selectedDate}
                        onChange={(d) => {
                          setClipActive(false)
                          setSelectedDate(d)
                        }}
                        disableFuture
                        availableDays={availableDays}
                        fullWidth
                      />
                    </div>
                    {/* 2 linhas empilhadas, cada uma ocupando a largura toda da coluna —
                        testado contra a página renderizada de verdade, o navigator pediu
                        pra não dividir a mesma linha (versão anterior, calendário + filtro
                        de horário lado a lado, ficava apertado demais na coluna de
                        ~320px). Ordem: data, depois hora, depois o dropdown de categoria
                        (já existia, inalterado). */}
                    {/* Filtra ao vivo, sem botão "Aplicar" (pedido do navigator) — cada
                        edição já atualiza `timeRange` direto. */}
                    <div className="flex w-full items-center">
                      <TimeRangeFilterPanel
                        from={timeRange.from}
                        to={timeRange.to}
                        onChange={(from, to) => setTimeRange({ from, to })}
                      />
                    </div>
                    {recordingItems.length > 0 && (
                      <>
                        {/* Dropdown dinâmico (pedido do navigator, no lugar dos chips fixos
                            antigos) — só `Tudo`/`Contínua` (fixos) + as categorias que de fato
                            existem nas gravações do dia (`filterOptions` acima). */}
                        <select
                          id="history-filter-dropdown"
                          aria-label="Filtrar gravações por categoria"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                          className="w-full rounded border border-border bg-surface-2 px-2 py-2 text-caption text-foreground"
                        >
                          {filterOptions.map((value) => (
                            <option key={value} value={value}>
                              {filterOptionLabel(value)}
                            </option>
                          ))}
                        </select>
                        {groupsByHour.length === 0 ? (
                          <div
                            id="history-recordings-empty"
                            className="flex flex-1 items-center justify-center px-2 py-4 text-center text-caption text-muted"
                          >
                            Nenhuma gravação para esse filtro
                          </div>
                        ) : (
                          <div
                            id="history-recordings-groups"
                            className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1"
                          >
                            {groupsByHour.map(([hour, items]) => {
                              const isOpen = !closedHours.has(hour)
                              return (
                                <div key={hour} className="rounded border border-border">
                                  <button
                                    id={`history-hour-group-${hour}`}
                                    type="button"
                                    onClick={() => toggleHour(hour)}
                                    aria-expanded={isOpen}
                                    className="flex w-full items-center justify-between px-2 py-1.5 text-caption font-medium text-muted hover:text-foreground"
                                  >
                                    <span>
                                      {String(hour).padStart(2, '0')}h — {items.length}{' '}
                                      {items.length === 1 ? 'gravação' : 'gravações'}
                                    </span>
                                    <ChevronDown
                                      className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                    />
                                  </button>
                                  {isOpen && (
                                    <div className="flex flex-col gap-1 border-t border-border p-1.5">
                                      {items.map(({ rec, duration, category: cat }) => {
                                        const active = rec.id === selectedId
                                        const blinkStyle =
                                          active && playing
                                            ? {
                                                animation:
                                                  'filmstrip-blink 1.1s ease-in-out infinite',
                                              }
                                            : undefined
                                        return (
                                          <button
                                            key={rec.id}
                                            id={`history-recording-${rec.id}`}
                                            ref={active ? activeCardRef : undefined}
                                            type="button"
                                            onClick={() => selectRecording(rec.id)}
                                            aria-current={active ? 'true' : undefined}
                                            style={blinkStyle}
                                            className={`flex items-center justify-between rounded border-2 px-2 py-1 text-left transition-colors ${
                                              active
                                                ? 'border-primary bg-primary/15'
                                                : `bg-surface-2 ${categoryBorderColor(cat)}`
                                            }`}
                                          >
                                            <span className="flex items-center gap-2">
                                              <Play className="h-4 w-4 shrink-0 text-muted-foreground" />
                                              <span className="text-caption font-medium tabular-nums text-foreground">
                                                {formatClockTime(rec.start)}
                                              </span>
                                              <span className="text-caption capitalize text-muted">
                                                {cat}
                                              </span>
                                            </span>
                                            {duration && (
                                              <span className="rounded bg-foreground/10 px-1 text-caption text-foreground">
                                                {duration}
                                              </span>
                                            )}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* Régua de 24h FORA da linha player+lista (não mais dentro de `history-main`) —
                pedido do navigator: ocupar a largura COMBINADA das duas colunas (não só a do
                player), pra dar mais espaço horizontal a cada bloco de hora (mais fácil
                distinguir as linhas verticais de cada gravação, sobretudo em horas cheias).
                `maxWidth: rowWidth` (medido via `getBoundingClientRect()` do player + da
                lista, ver `recomputeRowWidth` acima) alinha a régua exatamente com a borda
                esquerda do player até a borda direita da lista, sem alterar o sizing de
                nenhum dos dois — segue valendo mesmo sem cap de largura no player (T2 da
                história `feat/historico-navegacao-largura`), já que a medição é sempre pela
                posição RENDERIZADA, nunca por um valor fixo. Sem medição ainda/jsdom: sem
                teto, ocupa a largura total disponível. */}
            <div
              className="mx-auto w-full"
              style={rowWidth != null ? { maxWidth: rowWidth } : undefined}
            >
              <HistoryTimeline
                recordingItems={timeFilteredItems}
                filter={filter}
                onSelect={selectRecording}
                cameraId={camera.id}
                selectedId={selectedId}
                day={selectedDate ?? undefined}
              />
            </div>
          </CameraStageHeader>
        )}
      </div>
    </Layout>
  )
}
