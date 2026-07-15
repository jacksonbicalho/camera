import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { authHeaders, getToken, onUnauthorized } from '../auth'
import Layout from '../components/Layout'
import CameraStageHeader from '../components/CameraStageHeader'
import CameraViewTabs from '../components/CameraViewTabs'
import DatePicker from '../components/DatePicker'
import { ChevronDown, Loader2, Play } from '../components/Icons'
import VideoPlayer, { type VideoPlayerSegment } from '../components/VideoPlayer'
import HistoryTimeline from '../components/HistoryTimeline'
import {
  CHUNK_FALLBACK_MS,
  loadMotionEvents,
  loadRecordingsData,
  mergeRecordings,
  type MotionEvent,
  type Recording,
} from './cameraUtils'
import {
  matchesTimelineFilter,
  recordingCategory,
  type RecordingCategory,
  type TimelineFilter,
} from './eventCategory'
import { RecordingsGateway } from '../lib/recordingsGateway'

interface Camera {
  id: string
  name: string
  recording_enabled?: boolean
}

const CAT_BORDER: Record<RecordingCategory, string> = {
  continua: 'border-blue-500',
  movimento: 'border-amber-400',
  pessoa: 'border-red-500',
  ia: 'border-violet-500',
  estados: 'border-green-500',
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
  const { cameraId, recordingId } = useParams<{ cameraId: string; recordingId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  // Congela o :recordingId da URL só no 1º render — navegações subsequentes que a própria
  // página disparar (URL sync abaixo) não devem re-disparar a resolução.
  const [initialRecordingId] = useState(recordingId)
  const pendingSelectRef = useRef<number | null>(null)
  const [camera, setCamera] = useState<Camera | null>(null)
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
  // Reprodução contínua: null = desligada; array = ligada, com o snapshot das gravações a
  // encadear (tomado no instante em que liga — ver comentário no `toggleContinuous`).
  const [continuousRecordings, setContinuousRecordings] = useState<Recording[] | null>(null)

  // Resolve o :recordingId da URL (se veio um) pro dia que ele pertence — só na carga inicial.
  useEffect(() => {
    if (!cameraId) return
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
  }, [cameraId, initialRecordingId])

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
        const cam = Array.isArray(data)
          ? (data as Camera[]).find((c) => c.id === cameraId)
          : undefined
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
  const recordingItems = useMemo(
    () =>
      recordings.map((rec, i) => ({
        rec,
        duration: formatDuration(rec, recordings[i - 1]),
        category: recordingCategory(rec, events, CHUNK_FALLBACK_MS),
      })),
    [recordings, events],
  )
  const filteredRecordingItems = useMemo(
    () => recordingItems.filter((item) => matchesTimelineFilter(item.category, filter)),
    [recordingItems, filter],
  )

  // Agrupa por hora local (0-23) do início da gravação — cada grupo é colapsável, com
  // contagem no cabeçalho ("18h — 12 eventos"). A ordem dos grupos (desc) e dos itens dentro
  // de cada grupo (desc) segue a mesma ordem de `recordings`.
  const groupsByHour = useMemo(() => {
    const map = new Map<number, typeof filteredRecordingItems>()
    for (const item of filteredRecordingItems) {
      const hour = new Date(item.rec.start).getHours()
      const list = map.get(hour)
      if (list) list.push(item)
      else map.set(hour, [item])
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  }, [filteredRecordingItems])

  // Grupos COLAPSADOS (o padrão é todo mundo aberto — dia normal de câmera residencial tem
  // poucas horas com conteúdo; abrir tudo por padrão favorece escanear a lista inteira,
  // igual ao filmstrip plano de antes, e ainda permite recolher horas que não interessam).
  // Um grupo fechado reabre sozinho se o item ativo cair nele de novo (clique num card,
  // deep-link da URL, avanço da reprodução contínua) — nunca esconde o item em reprodução.
  const [closedHours, setClosedHours] = useState<Set<number>>(new Set())
  // Ajuste durante o render (mesmo padrão de `errorForId`/`continuousResetForDate` abaixo),
  // não useEffect+setState — reabre o grupo do item ativo se ele tiver sido fechado.
  const activeHour = selected ? new Date(selected.start).getHours() : null
  if (activeHour != null && closedHours.has(activeHour)) {
    const next = new Set(closedHours)
    next.delete(activeHour)
    setClosedHours(next)
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
  const mainRef = useCallback((el: HTMLDivElement | null) => {
    mainObserverRef.current?.disconnect()
    mainObserverRef.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height
      if (height != null) setMainHeight(height)
    })
    observer.observe(el)
    mainObserverRef.current = observer
  }, [])

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
  const segments = continuousRecordings ? continuousSegments : singleSegments

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

  // Reprodução contínua não atravessa a troca de dia — reseta ao trocar (mesmo padrão de
  // ajuste-durante-o-render usado acima, não useEffect+setState).
  const [continuousResetForDate, setContinuousResetForDate] = useState(selectedDate)
  if (selectedDate !== continuousResetForDate) {
    setContinuousResetForDate(selectedDate)
    setContinuousRecordings(null)
  }

  function selectRecording(id: number) {
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
    setContinuousRecordings((prev) =>
      prev ? null : buildContinuousSequence(recordings, selectedId),
    )
  }

  return (
    <Layout id="history-page" footerId="history-footer" contentClassName="p-6">
      {/* Exceção intencional ao padrão `.page-content` (ver CLAUDE.md "Largura do conteúdo"):
          Histórico é de duas colunas — player à esquerda (`history-main`, largura
          capada pra não virar um vídeo gigante), lista de gravações à direita
          (`history-recordings-list`, largura fixa). Junto, as duas colunas usam quase toda a
          largura da viewport, diferente das páginas de player único (Ao vivo/Reprodução) que
          continuam capadas em `.page-content`. Empilha em coluna única abaixo do breakpoint
          `lg`.
          O título (`history-header`, dentro do `CameraStageHeader`) fica FORA da linha de
          duas colunas — só o `children` do `CameraStageHeader` (o `<div>` logo abaixo) entra
          nela — pra que o TOPO do sidebar (`history-recordings-list`) alinhe com o topo do
          PLAYER, não com o topo do título. */}
      <div id="history-content" className="flex w-full flex-col gap-3">
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
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-center">
              <div
                ref={mainRef}
                id="history-main"
                className="flex min-w-0 flex-1 flex-col gap-2 lg:max-w-[72rem]"
              >
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
                  // O calendário saiu daqui pro topo do `history-recordings-list` (pedido do
                  // navigator) — sem `footerTrailing`, o `ml-auto` que empurrava
                  // `footerEnd`/`fullscreenButton` pra ponta direita da linha some junto (ver
                  // comentário da prop em VideoPlayer.tsx); reaplicado direto no wrapper do
                  // `footerEnd` abaixo pra manter as abas Ao vivo/Histórico coladas na direita.
                  footerEnd={
                    <div className="ml-auto flex items-center gap-3">
                      <CameraViewTabs cameraId={camera.id} active="history" />
                    </div>
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
                <HistoryTimeline
                  recordingItems={recordingItems}
                  onSelect={selectRecording}
                  cameraId={camera.id}
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
                  id="history-recordings-list"
                  className="flex w-full flex-col gap-1.5 overflow-hidden rounded-lg border border-border p-2 lg:w-80 lg:shrink-0"
                  style={mainHeight != null ? { maxHeight: mainHeight } : undefined}
                >
                  <div className="flex items-center justify-end">
                    <DatePicker
                      id="history-date-picker"
                      value={selectedDate}
                      onChange={setSelectedDate}
                      disableFuture
                      availableDays={availableDays}
                      align="right"
                    />
                  </div>
                  {recordingItems.length > 0 && (
                    <>
                      <div id="history-filter-chips" className="flex items-center gap-1.5">
                        {(
                          [
                            { value: 'todos', label: 'Tudo' },
                            { value: 'movimento', label: 'Movimento' },
                            { value: 'pessoa', label: 'Pessoa' },
                            { value: 'continua', label: 'Contínua' },
                          ] as const
                        ).map((chip) => (
                          <button
                            key={chip.value}
                            id={`history-filter-${chip.value}`}
                            type="button"
                            onClick={() => setFilter(chip.value)}
                            aria-pressed={filter === chip.value}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-caption font-medium transition-colors ${
                              filter === chip.value
                                ? 'border-primary bg-primary/15 text-primary'
                                : 'border-border text-muted hover:text-foreground'
                            }`}
                          >
                            {chip.value === 'pessoa' && (
                              <span
                                className="h-1.5 w-1.5 rounded-full bg-red-500"
                                aria-hidden="true"
                              />
                            )}
                            {chip.label}
                          </button>
                        ))}
                      </div>
                      <div
                        id="history-recordings-groups"
                        className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1"
                      >
                        {groupsByHour.length === 0 && (
                          <div className="px-2 py-4 text-center text-caption text-muted">
                            Nenhuma gravação com esse filtro.
                          </div>
                        )}
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
                                  {items.length === 1 ? 'evento' : 'eventos'}
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
                                        ? { animation: 'filmstrip-blink 1.1s ease-in-out infinite' }
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
                                            : `bg-surface-2 ${CAT_BORDER[cat]}`
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
                    </>
                  )}
                </div>
              )}
            </div>
          </CameraStageHeader>
        )}
      </div>
    </Layout>
  )
}
