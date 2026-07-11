import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { authHeaders, getToken, onUnauthorized } from '../auth'
import Layout from '../components/Layout'
import CameraStageHeader from '../components/CameraStageHeader'
import CameraViewTabs from '../components/CameraViewTabs'
import DatePicker from '../components/DatePicker'
import { Loader2, Play } from '../components/Icons'
import VideoPlayer, { type VideoPlayerSegment } from '../components/VideoPlayer'
import {
  loadMotionEvents,
  loadRecordingsData,
  mergeRecordings,
  type MotionEvent,
  type Recording,
} from './cameraUtils'
import { recordingCategory, type RecordingCategory } from './eventCategory'
import { RecordingsGateway } from '../lib/recordingsGateway'

interface Camera {
  id: string
  name: string
  recording_enabled?: boolean
}

// Janela usada só pra classificar a categoria do chunk (recordingCategory) quando
// `end` não veio na API — mesmo fallback de tamanho usado no Filmstrip legado.
const CHUNK_FALLBACK_MS = 5 * 60_000

// Quantidade de gravações buscada por página — não o dia inteiro de uma vez (que podia
// significar centenas de chunks). ~2x o que cabe visível num filmstrip de cards w-32 numa
// coluna page-content; o resto carrega sob demanda ("Carregar mais").
const PAGE_SIZE = 20

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
// DatePicker, default hoje): player tocando a selecionada + tira de cards ("GRAVAÇÕES · N")
// pra trocar de gravação. Cabeçalho compartilhado com LivePage via CameraStageHeader (mesma
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
  // Paginação do filmstrip: `recordings` acumula as páginas já carregadas (sempre em ordem
  // cronológica DECRESCENTE — mais recente primeiro), `page` é a última página carregada,
  // `hasMore` indica se o dia tem mais gravações além do que já foi buscado.
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  // Espelha `page` pro poll ler sem fechar sobre um valor obsoleto — sem entrar nas deps do
  // useEffect do poll, que senão reiniciaria o intervalo a cada "Carregar mais".
  const pageRef = useRef(1)
  // Total REAL de gravações do dia (campo `total` da API — contagem no filesystem, não afetada
  // por paginação), exclui a gravação em andamento (mesmo critério que já exclui `is_recording`
  // do filmstrip). `recordings.length` NÃO serve pro contador: cresce com o que o poll/"Carregar
  // mais" foi acumulando em tela, sem nunca refletir uma exclusão pelo `storage.Cleaner` fora da
  // janela carregada — dava pra "a contagem chega a 22/23, recarrega a página e mostra 19".
  const [dayTotal, setDayTotal] = useState<number | null>(null)
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
      const evs = await loadMotionEvents(cameraId!, selectedDate!)
      if (cancelled) return

      // Busca a 1ª página (mais recentes) e, só se a URL compartilhável pedir uma gravação
      // específica que não veio nessa página, continua paginando até achar ou até acabarem
      // as páginas (hasMore). Navegação normal (sem :recordingId pendente) para na 1ª página.
      let currentPage = 1
      let recs: Recording[] = []
      let more: boolean
      let total: number
      let sawActive = false
      for (;;) {
        const recRes = await loadRecordingsData(
          cameraId!,
          selectedDate!,
          currentPage,
          'desc',
          PAGE_SIZE,
        )
        if (cancelled) return
        if (recRes === 401) {
          onUnauthorized()
          return
        }
        recs = [...recs, ...recRes.recordings.filter((r) => !r.is_recording)]
        more = recRes.hasMore
        total = recRes.total
        if (recRes.recordings.some((r) => r.is_recording)) sawActive = true
        // Sem alvo pendente (navegação normal): só a 1ª página, mesmo que hasMore — a
        // paginação automática é só pra achar uma gravação específica vinda da URL.
        if (pending == null) break
        if (recs.some((r) => r.id === pending) || !more) break
        currentPage += 1
      }

      setRecordings(recs)
      setEvents(evs)
      setHasMore(more)
      setPage(currentPage)
      pageRef.current = currentPage
      setDayTotal(total - (sawActive ? 1 : 0))
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

  // Poll pra manter a lista/contador atualizados sem precisar recarregar a página (mesmo
  // cadência do CameraPage: 5s pro dia de hoje — chunks novos terminando —, 30s pra dias
  // passados). Re-busca TODA a janela já carregada (page*PAGE_SIZE, não só a página 1) numa
  // chamada só — é a única forma de `mergeRecordings` enxergar uma gravação que já estava em
  // tela e foi apagada pelo `storage.Cleaner` (retenção tende a apagar as mais antigas, que
  // ficam justamente fora da página 1 depois de "Carregar mais"); itens além do que já foi
  // carregado continuam preservados via `hasMore`. Nunca mexe em `selectedId`/`videoLoading`/
  // `page` — não interrompe a reprodução nem invalida o "Carregar mais" que o usuário já
  // clicou. `mergeRecordings` devolve a MESMA referência quando nada mudou, evitando remount
  // do <video> (key={selected.id}) à toa.
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
          loadRecordingsData(cameraId, selectedDate, 1, 'desc', pageRef.current * PAGE_SIZE),
          loadMotionEvents(cameraId, selectedDate),
        ])
        if (recRes === 401) {
          onUnauthorized()
          return
        }
        const recs = recRes.recordings.filter((r) => !r.is_recording)
        setRecordings((prev) => mergeRecordings(prev, recs, 'desc', recRes.hasMore))
        setEvents(evs)
        setDayTotal(recRes.total - (recRes.recordings.some((r) => r.is_recording) ? 1 : 0))
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

  // `recordings` já vem em ordem decrescente (mais recente primeiro — pedido igual à exibição
  // do filmstrip, sem precisar reverter). O "próximo cronológico" (pra inferir a duração quando
  // `end` não veio) de um item no índice `i` é o índice ANTERIOR (`i - 1`), que é mais recente
  // que ele nessa ordem — o mais recente de todos (índice 0) não tem "próximo".
  const filmstripItems = useMemo(
    () => recordings.map((rec, i) => ({ rec, duration: formatDuration(rec, recordings[i - 1]) })),
    [recordings],
  )

  // Rola o filmstrip (scroll horizontal) até o card ativo entrar em vista, centralizado —
  // sobretudo importante ao abrir a URL compartilhável de uma gravação específica
  // (/history/:cameraId/:recordingId): sem isso, se a gravação estiver longe no filmstrip
  // (dia com muitos chunks), o card destacado fica fora da área visível.
  const activeCardRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    activeCardRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [selectedId])

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
        ? [{ src: `${selected.url}?token=${getToken()}`, fromSeconds: 0, toSeconds: Infinity }]
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
            return { src: `${rec.url}?token=${getToken()}`, fromSeconds: 0, toSeconds }
          })
        : [],
    [continuousRecordings],
  )
  const segments = continuousRecordings ? continuousSegments : singleSegments

  // onSegmentChange (VideoPlayer) dispara com o índice do segmento ativo a cada transição —
  // mapeia de volta pro id da gravação via ref (callback com deps vazias = identidade
  // estável; se não fosse estável, mudaria a cada render de HistoryPage e isso cascatearia
  // pro VideoPlayer reiniciar o motor à toa, ver comentário acima). `setSelectedId` já
  // dispara o efeito de sync de URL existente — não precisa de lógica de URL nova aqui.
  const activeRecordingsRef = useRef<Recording[]>([])
  activeRecordingsRef.current = continuousRecordings ?? (selected ? [selected] : [])
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
    // Com o modo contínuo ligado, clicar num card RE-ANCORA a sequência nele (mantém
    // ligado) em vez de desligar — é assim que se pula pra outro ponto do dia sem sair do
    // modo: a partir de agora encadeia as mais novas que `id`, na ordem "id, id+1, id+2...".
    if (continuousRecordings != null) {
      setContinuousRecordings(buildContinuousSequence(recordings, id))
    }
    // Clicar no card já ativo não é uma troca de verdade: `key={selected.id}` não muda, o
    // <video> não remonta, e "onLoadedData" não dispara de novo — sem esse guard,
    // `videoLoading` ficava travado em `true` até o usuário clicar noutro card.
    if (id === selectedId) return
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

  // "Carregar mais" — busca a próxima página (mais antiga) sob demanda e concatena no fim do
  // filmstrip (que já está em ordem decrescente, então a página nova continua a sequência).
  // Filtra por id pra não duplicar se, por azar, sobrepuser algo que o poll já trouxe.
  async function loadMore() {
    if (!cameraId || !selectedDate || loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const recRes = await loadRecordingsData(cameraId, selectedDate, nextPage, 'desc', PAGE_SIZE)
      if (recRes === 401) {
        onUnauthorized()
        return
      }
      const newRecs = recRes.recordings.filter((r) => !r.is_recording)
      setRecordings((prev) => {
        const existing = new Set(prev.map((r) => r.id))
        return [...prev, ...newRecs.filter((r) => !existing.has(r.id))]
      })
      setHasMore(recRes.hasMore)
      setPage(nextPage)
      pageRef.current = nextPage
      setDayTotal(recRes.total - (recRes.recordings.some((r) => r.is_recording) ? 1 : 0))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <Layout id="history-page" footerId="history-footer" contentClassName="p-6">
      {/* .page-content: MESMA largura de Ao vivo/Reprodução (largura das páginas é padrão —
          antes cada página tinha seu próprio max-w-* divergente). Histórico tem o filmstrip
          abaixo do player, então soma mais altura que as outras duas — os espaçamentos abaixo
          (space-y-2, margens do bloco de gravações, cards do filmstrip em h-16 em vez de h-20)
          foram enxugados ao máximo pra ajudar a caber sem scroll (medido: mesmo com o dia
          vazio, sem filmstrip nenhum, Histórico já soma ~50px a mais que Ao vivo em 1366×768 só
          com o bloco "Gravações"/calendário — com o filmstrip real a diferença é maior). Ainda
          assim pode rolar em viewports baixas — normal pra uma página com mais conteúdo vertical
          que as outras, não um bug de layout a "consertar" estreitando o player ou a página. */}
      <div id="history-content" className="page-content space-y-2">
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
              footerTrailing={
                <DatePicker
                  id="history-date-picker"
                  value={selectedDate ?? new Date()}
                  onChange={setSelectedDate}
                  disableFuture
                  availableDays={availableDays}
                  align="right"
                  openUp
                />
              }
              footerEnd={<CameraViewTabs cameraId={camera.id} active="history" />}
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
          </CameraStageHeader>
        )}
        {camera && (
          <div id="history-recordings" className="rounded-lg border border-border p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="whitespace-nowrap text-caption font-medium uppercase tracking-wide text-muted">
                {dayTotal ? `Gravações · ${dayTotal}` : 'Gravações'}
              </p>
            </div>
            {recordings.length > 0 && (
              <div
                id="history-recordings-list"
                className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-surface-2"
              >
                {filmstripItems.map(({ rec, duration }) => {
                  const cat = recordingCategory(rec, events, CHUNK_FALLBACK_MS)
                  const active = rec.id === selectedId
                  // Ativo: fundo na cor de destaque do usuário (mesma convenção do item ativo
                  // da sidebar) + borda cheia (em vez da cor de categoria) + pisca (box-shadow,
                  // keyframe já usado no Filmstrip legado) enquanto o vídeo está tocando de
                  // verdade — só "selecionado" (pausado) não pisca. Cards inativos mantêm a
                  // cor de categoria intacta (informação real, não deve ser ofuscada).
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
                      className={`relative flex h-16 w-32 shrink-0 flex-col justify-between rounded border-2 p-1.5 text-left transition-colors ${
                        active ? 'border-primary bg-primary/15' : `bg-surface-2 ${CAT_BORDER[cat]}`
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <Play className="h-4 w-4 text-muted-foreground" />
                        {duration && (
                          <span className="rounded bg-foreground/10 px-1 text-caption text-foreground">
                            {duration}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-caption font-medium tabular-nums text-foreground">
                          {formatClockTime(rec.start)}
                        </p>
                        <p className="text-caption capitalize text-muted">{cat}</p>
                      </div>
                    </button>
                  )
                })}
                {hasMore && (
                  <button
                    id="history-load-more"
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="flex h-16 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-border text-caption text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                  >
                    {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Carregar mais'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
