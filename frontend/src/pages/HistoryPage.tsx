import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { authHeaders, getToken, onUnauthorized } from '../auth'
import Layout from '../components/Layout'
import CameraStageHeader from '../components/CameraStageHeader'
import DatePicker from '../components/DatePicker'
import { Loader2, Play } from '../components/Icons'
import PlayerControlsOverlay from '../components/PlayerControlsOverlay'
import { usePlayerZoom } from '../hooks/usePlayerZoom'
import { loadMotionEvents, loadRecordingsData, mergeRecordings, type MotionEvent, type Recording } from './cameraUtils'
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
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => (initialRecordingId ? null : new Date()))
  const [availableDays, setAvailableDays] = useState<string[]>([])
  const [readyForUrlSync, setReadyForUrlSync] = useState(!initialRecordingId)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const zoom = usePlayerZoom(() => videoRef.current)
  const bindZoom = zoom.setContainer
  const setPlayerContainer = useCallback((node: HTMLDivElement | null) => bindZoom(node), [bindZoom])

  // Resolve o :recordingId da URL (se veio um) pro dia que ele pertence — só na carga inicial.
  useEffect(() => {
    if (!cameraId) return
    const targetId = initialRecordingId
    if (!targetId) return
    let cancelled = false
    gateway.getRecording(cameraId, targetId).then(meta => {
      if (cancelled) return
      if (!meta) {
        setError('Gravação não encontrada.')
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
        const cam = Array.isArray(data) ? (data as Camera[]).find(c => c.id === cameraId) : undefined
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
      const [recRes, evs] = await Promise.all([
        loadRecordingsData(cameraId!, selectedDate!, 1, 'asc', 0),
        loadMotionEvents(cameraId!, selectedDate!),
      ])
      if (cancelled) return
      if (recRes === 401) {
        onUnauthorized()
        return
      }
      const recs = recRes.recordings.filter(r => !r.is_recording)
      setRecordings(recs)
      setEvents(evs)
      const pending = pendingSelectRef.current
      pendingSelectRef.current = null
      const initial = pending != null && recs.some(r => r.id === pending) ? pending : recs.length > 0 ? recs[0].id : null
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
  // passados). Só atualiza `recordings`/`events`; nunca mexe em `selectedId`/`videoLoading`,
  // então não interrompe a reprodução em andamento. `mergeRecordings` devolve a MESMA
  // referência quando nada mudou, evitando remount do <video> (key={selected.id}) à toa.
  useEffect(() => {
    if (!cameraId || !selectedDate) return
    const today = new Date()
    const isToday =
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()

    const interval = setInterval(async () => {
      const [recRes, evs] = await Promise.all([
        loadRecordingsData(cameraId, selectedDate, 1, 'asc', 0),
        loadMotionEvents(cameraId, selectedDate),
      ])
      if (recRes === 401) {
        onUnauthorized()
        return
      }
      const recs = recRes.recordings.filter(r => !r.is_recording)
      setRecordings(prev => mergeRecordings(prev, recs, 'asc', recRes.hasMore))
      setEvents(evs)
    }, isToday ? 5_000 : 30_000)

    return () => clearInterval(interval)
  }, [cameraId, selectedDate])

  // Dias com gravação ou evento — o calendário só habilita esses.
  useEffect(() => {
    if (!cameraId) return
    fetch(`/api/cameras/${cameraId}/content-days`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : { days: [] }))
      .then((d: { days?: string[] }) => setAvailableDays(d.days ?? []))
      .catch(() => {})
  }, [cameraId])

  // Mantém a URL sincronizada com selectedId (troca manual de card ou seleção automática) —
  // sempre que uma gravação está em reprodução, a barra de endereço reflete ela e vira
  // compartilhável. Só entra em ação depois da resolução inicial (readyForUrlSync) pra não
  // reescrever uma URL compartilhada antes dela ser resolvida.
  useEffect(() => {
    if (!cameraId || !readyForUrlSync) return
    const target = selectedId != null ? `/history/${cameraId}/${selectedId}` : `/history/${cameraId}`
    if (location.pathname !== target) navigate(target, { replace: true })
  }, [cameraId, selectedId, readyForUrlSync, location.pathname, navigate])

  const selected = useMemo(() => recordings.find(r => r.id === selectedId) ?? null, [recordings, selectedId])

  // Duração calculada na ordem cronológica original (precisa do próximo cronológico pra
  // inferir o fim quando `end` não veio) e só ENTÃO invertida pra exibição — a mais recente
  // cai à esquerda no filmstrip sem bagunçar o fallback de duração.
  const filmstripItems = useMemo(
    () => recordings.map((rec, i) => ({ rec, duration: formatDuration(rec, recordings[i + 1]) })).reverse(),
    [recordings],
  )

  // Rola o filmstrip (scroll horizontal) até o card ativo entrar em vista, centralizado —
  // sobretudo importante ao abrir a URL compartilhável de uma gravação específica
  // (/history/:cameraId/:recordingId): sem isso, se a gravação estiver longe no filmstrip
  // (dia com muitos chunks), o card destacado fica fora da área visível.
  const activeCardRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    activeCardRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [selectedId])

  // O <video> remonta a cada troca de gravação (key={selected.id}) — sem isso o zoom
  // acumulado ficaria "preso" no estado antigo (transform não reaplicado ao elemento novo).
  const resetZoom = zoom.reset
  useEffect(() => {
    resetZoom()
  }, [selectedId, resetZoom])

  // <video> tem autoPlay — assume tocando até "onPause" provar o contrário. Ajuste durante o
  // render (não useEffect+setState — dispararia um render extra e o eslint
  // react-hooks/set-state-in-effect barra esse padrão), mesmo truque do CameraViewTabs.
  const [playingForId, setPlayingForId] = useState(selectedId)
  if (selectedId !== playingForId) {
    setPlayingForId(selectedId)
    setPlaying(true)
    setVideoError(false)
  }

  function selectRecording(id: number) {
    // Clicar no card já ativo não é uma troca de verdade: `key={selected.id}` não muda, o
    // <video> não remonta, e "onLoadedData" não dispara de novo — sem esse guard,
    // `videoLoading` ficava travado em `true` até o usuário clicar noutro card.
    if (id === selectedId) return
    setSelectedId(id)
    setVideoLoading(true)
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
            cameraId={camera.id}
            cameraName={camera.name}
            active="history"
            recordingEnabled={camera.recording_enabled}
          >
            <div
              id="history-player"
              ref={setPlayerContainer}
              onPointerDown={zoom.onPointerDown}
              onPointerMove={zoom.onPointerMove}
              onPointerUp={zoom.onPointerUp}
              data-on-video
              className={`group relative w-full overflow-hidden rounded-lg border border-border bg-black shadow-sm aspect-video${zoom.isZoomed ? ' cursor-grab' : ''}`}
            >
              {selected ? (
                <>
                  <video
                    id="history-player-video"
                    ref={videoRef}
                    key={selected.id}
                    src={`${selected.url}?token=${getToken()}`}
                    className="h-full w-full"
                    controls
                    autoPlay
                    muted
                    onLoadedData={() => setVideoLoading(false)}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onError={() => {
                      setVideoLoading(false)
                      setVideoError(true)
                    }}
                  />
                  <PlayerControlsOverlay id="history-player-video" zoom={zoom} />
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
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-body text-muted">
                  Sem gravações nesse dia.
                </div>
              )}
            </div>
          </CameraStageHeader>
        )}
        {camera && (
          <div id="history-recordings" className="rounded-lg border border-border p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-caption font-medium uppercase tracking-wide text-muted">
                {recordings.length > 0 ? `Gravações · ${recordings.length}` : 'Gravações'}
              </p>
              <DatePicker
                id="history-date-picker"
                value={selectedDate ?? new Date()}
                onChange={setSelectedDate}
                disableFuture
                availableDays={availableDays}
                align="right"
                openUp
              />
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
                  const blinkStyle = active && playing ? { animation: 'filmstrip-blink 1.1s ease-in-out infinite' } : undefined
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
                          <span className="rounded bg-foreground/10 px-1 text-caption text-foreground">{duration}</span>
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
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
