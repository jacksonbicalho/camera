import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { Play, Pause, Repeat, Maximize, VolumeX, Volume2 } from '../components/Icons'
import {
  RecordingsGateway,
  clipSegments,
  UNAUTHORIZED,
  type Recording,
  type GatewayEvent,
  type ClipSegment,
} from '../lib/recordingsGateway'
import { segmentDuration, clipTotal, globalTime, locate, formatClock } from '../lib/clipTimeline'
import { formatDateTime } from '../lib/datetime'

// VideoBrowserPage é a página nova (método estrangulamento) que reproduz gravações
// consumindo SÓ o RecordingsGateway — o único intermediário com o backend. Não toca o
// CameraPage legado.
//
// Rota: /recording/:cameraId/:recordingId(/:motionId)?
//   - sem motionId  → reproduz o chunk-âncora do início;
//   - com motionId  → resolve occurred_at + lead/trail e monta o clip
//     [occurred−lead, occurred+trail], reproduzindo a playlist de segmentos
//     atravessando as fronteiras dos chunks.
//
// A transição entre chunks usa DOUBLE-BUFFERING (dois <video> empilhados): enquanto um
// toca, o outro pré-carrega o segmento seguinte já posicionado no fromSeconds. Na
// fronteira só troca-se a visibilidade — sem reload, sem tela preta piscando. O MP4 é
// não-fragmentado, então MSE (append num único buffer) não é opção.
//
// A barra de controle é PRÓPRIA (não-nativa) e única, sobreposta aos dois vídeos, então
// não "re-arma" na troca de segmento: barra de progresso do clipe inteiro (com seek),
// play/pause, tempo, mudo e tela cheia.

const gateway = new RecordingsGateway()

export default function VideoBrowserPage() {
  const { cameraId, recordingId, motionId } = useParams<{
    cameraId: string
    recordingId: string
    motionId?: string
  }>()

  const containerRef = useRef<HTMLDivElement>(null)
  const seekBarRef = useRef<HTMLDivElement>(null)
  const elsRef = useRef<(HTMLVideoElement | null)[]>([null, null])
  const heldSegRef = useRef<number[]>([-1, -1]) // segmento que cada elemento carrega (-1 = nenhum)
  const pendingSeekRef = useRef<(number | null)[]>([null, null]) // seek a aplicar no onMeta
  const activeRef = useRef(0) // elemento visível/tocando
  const segmentsRef = useRef<ClipSegment[]>([])
  const realDurRef = useRef<(number | undefined)[]>([]) // duração real de cada segmento (por índice)
  const durationsRef = useRef<number[]>([]) // duração reproduzível de cada segmento
  const playingRef = useRef(false) // intenção de reprodução (sobrevive à troca de src)
  const scrubbingRef = useRef(false)
  const repeatRef = useRef(false) // loop do clipe ao terminar

  const [activeEl, setActiveEl] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<Recording | null>(null)
  const [event, setEvent] = useState<GatewayEvent | null>(null)
  const [segments, setSegments] = useState<ClipSegment[]>([])
  const [curSeg, setCurSeg] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true) // muted p/ liberar autoplay sem gesto
  const [repeat, setRepeat] = useState(false)
  const [pos, setPos] = useState(0) // posição global (s)
  const [total, setTotal] = useState(0) // duração total do clipe (s)
  const [fullscreen, setFullscreen] = useState(false)
  const [timezone, setTimezone] = useState('UTC')

  const setPlayingIntent = useCallback((v: boolean) => {
    playingRef.current = v
    setPlaying(v)
  }, [])

  // recomputeDurations recalcula as durações reproduzíveis (usa a duração real quando
  // conhecida) e o total do clipe.
  const recomputeDurations = useCallback(() => {
    const d = segmentsRef.current.map((s, i) => segmentDuration(s, realDurRef.current[i]))
    durationsRef.current = d
    setTotal(clipTotal(d))
  }, [])

  // loadInto prepara o elemento com um segmento (src + seek no fromSeconds via onMeta),
  // deixando-o pausado (pré-carregado). Fora de faixa → limpa o elemento.
  const loadInto = useCallback((elIdx: number, segIdx: number) => {
    const el = elsRef.current[elIdx]
    if (!el) return
    const seg = segmentsRef.current[segIdx]
    if (!seg) {
      heldSegRef.current[elIdx] = -1
      el.removeAttribute('src')
      el.load()
      return
    }
    heldSegRef.current[elIdx] = segIdx
    el.src = gateway.playbackURL(seg.recording)
    el.load()
  }, [])

  // Ao carregar a metadata: registra a duração real, posiciona (seek pendente ou
  // fromSeconds); se for o ativo e a intenção é tocar, dá play.
  const onMeta = useCallback(
    (elIdx: number) => {
      const el = elsRef.current[elIdx]
      const segIdx = heldSegRef.current[elIdx]
      const seg = segmentsRef.current[segIdx]
      if (!el || !seg) return
      if (Number.isFinite(el.duration)) {
        realDurRef.current[segIdx] = el.duration
        recomputeDurations()
      }
      const pending = pendingSeekRef.current[elIdx]
      el.currentTime = pending != null ? pending : seg.fromSeconds
      pendingSeekRef.current[elIdx] = null
      if (elIdx === activeRef.current && playingRef.current) el.play().catch(() => {})
    },
    [recomputeDurations],
  )

  // activate torna o elemento visível e o toca (já pré-carregado no fromSeconds → sem
  // re-seek, evitando flash). Se ainda não tem metadata, o onMeta tocará ao chegar.
  const activate = useCallback((elIdx: number) => {
    activeRef.current = elIdx
    setActiveEl(elIdx)
    setCurSeg(heldSegRef.current[elIdx])
    const el = elsRef.current[elIdx]
    if (el && el.readyState >= 1 && playingRef.current) el.play().catch(() => {})
  }, [])

  // restartClip reinicia o clipe do segmento 0 (usado no loop). Mantém as durações reais
  // já aprendidas (realDurRef/durationsRef) — não recomputa do zero.
  const restartClip = useCallback(() => {
    heldSegRef.current = [-1, -1]
    pendingSeekRef.current = [null, null]
    activeRef.current = 0
    setActiveEl(0)
    setCurSeg(0)
    setPos(0)
    setPlayingIntent(true)
    loadInto(0, 0)
    loadInto(1, 1)
  }, [loadInto, setPlayingIntent])

  // advance troca para o próximo segmento (que o outro elemento já pré-carregou) e põe o
  // elemento liberado para pré-carregar o segmento seguinte.
  const advance = useCallback(() => {
    const active = activeRef.current
    const nextSeg = heldSegRef.current[active] + 1
    if (nextSeg >= segmentsRef.current.length) {
      if (repeatRef.current) {
        restartClip()
        return
      }
      elsRef.current[active]?.pause()
      setPlayingIntent(false)
      setPos(clipTotal(durationsRef.current)) // crava o fim (thumb chega na borda direita)
      return
    }
    const other = 1 - active
    if (heldSegRef.current[other] !== nextSeg) loadInto(other, nextSeg)
    activate(other)
    loadInto(active, nextSeg + 1)
  }, [activate, loadInto, restartClip, setPlayingIntent])

  const onTimeUpdate = useCallback(
    (elIdx: number) => {
      if (elIdx !== activeRef.current) return
      const el = elsRef.current[elIdx]
      const segIdx = heldSegRef.current[elIdx]
      const seg = segmentsRef.current[segIdx]
      if (!el || !seg) return
      // Corte por toSeconds (trail termina no meio do arquivo).
      if (Number.isFinite(seg.toSeconds) && el.currentTime >= seg.toSeconds) {
        advance()
        return
      }
      if (!scrubbingRef.current) {
        setPos(globalTime(durationsRef.current, segIdx, el.currentTime - seg.fromSeconds))
      }
    },
    [advance],
  )

  // Fim natural do arquivo: o toSeconds inferido pode passar da duração real (vãos entre
  // chunks) — ao acabar, avança.
  const onEnded = useCallback(
    (elIdx: number) => {
      if (elIdx !== activeRef.current) return
      if (heldSegRef.current[elIdx] + 1 < segmentsRef.current.length) advance()
      else if (repeatRef.current) restartClip()
      else {
        setPlayingIntent(false)
        setPos(clipTotal(durationsRef.current)) // crava o fim (thumb chega na borda direita)
      }
    },
    [advance, restartClip, setPlayingIntent],
  )

  const togglePlay = useCallback(() => {
    const el = elsRef.current[activeRef.current]
    if (!el) return
    if (playingRef.current) {
      setPlayingIntent(false)
      el.pause()
    } else {
      setPlayingIntent(true)
      el.play().catch(() => {})
    }
  }, [setPlayingIntent])

  const toggleRepeat = useCallback(() => {
    setRepeat(r => {
      repeatRef.current = !r
      return !r
    })
  }, [])

  const toggleMute = useCallback(() => {
    setMuted(m => {
      const next = !m
      elsRef.current.forEach(el => {
        if (el) el.muted = next
      })
      return next
    })
  }, [])

  const toggleFullscreen = useCallback(() => {
    const c = containerRef.current
    if (!c) return
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    else c.requestFullscreen?.().catch(() => {})
  }, [])

  // seekGlobal posiciona o clipe numa posição global (arraste da barra). Se o segmento
  // alvo já está no elemento ativo, só ajusta o currentTime; senão carrega o alvo (seek
  // manual pode piscar — é ação do usuário) e re-pré-carrega o vizinho.
  const seekGlobal = useCallback((p: number) => {
    setPos(p)
    const { index, localOffset } = locate(durationsRef.current, p)
    const seg = segmentsRef.current[index]
    if (!seg) return
    const fileTime = seg.fromSeconds + localOffset
    const active = activeRef.current
    if (heldSegRef.current[active] === index) {
      const el = elsRef.current[active]
      if (el) el.currentTime = fileTime
      setCurSeg(index)
    } else {
      pendingSeekRef.current[active] = fileTime
      loadInto(active, index)
      setCurSeg(index)
      loadInto(1 - active, index + 1)
    }
  }, [loadInto])

  // Barra de progresso própria (div): fração pela posição do ponteiro sobre o track.
  const seekFromClientX = useCallback((clientX: number) => {
    const bar = seekBarRef.current
    if (!bar || total <= 0) return
    const rect = bar.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    seekGlobal(f * total)
  }, [seekGlobal, total])

  const onSeekDown = useCallback((e: React.PointerEvent) => {
    scrubbingRef.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    seekFromClientX(e.clientX)
  }, [seekFromClientX])

  const onSeekMove = useCallback((e: React.PointerEvent) => {
    if (scrubbingRef.current) seekFromClientX(e.clientX)
  }, [seekFromClientX])

  const onSeekUp = useCallback((e: React.PointerEvent) => {
    scrubbingRef.current = false
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }, [])

  // startPlayback arranca no segmento 0 (elemento ativo) e pré-carrega o 1 no outro.
  const startPlayback = useCallback(
    (segs: ClipSegment[]) => {
      segmentsRef.current = segs
      realDurRef.current = new Array(segs.length)
      setSegments(segs)
      heldSegRef.current = [-1, -1]
      pendingSeekRef.current = [null, null]
      activeRef.current = 0
      setActiveEl(0)
      setCurSeg(0)
      setPos(0)
      recomputeDurations()
      setPlayingIntent(true)
      if (segs.length === 0) return
      loadInto(0, 0)
      loadInto(1, 1)
    },
    [loadInto, recomputeDurations, setPlayingIntent],
  )

  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  useEffect(() => {
    gateway.getTimezone().then(setTimezone).catch(() => {})
  }, [])

  useEffect(() => {
    if (!cameraId || !recordingId) return
    let cancelled = false

    async function load() {
      setError(null)

      // 1. Resolve o chunk-âncora → dia.
      const meta = await gateway.getRecording(cameraId!, recordingId!)
      if (cancelled) return
      if (!meta) {
        setError('Gravação não encontrada.')
        return
      }
      const [y, m, d] = meta.date.split('-').map(Number)
      const dayRecs = await gateway.listByDay(cameraId!, new Date(y, m - 1, d), 'asc')
      if (cancelled) return
      if (dayRecs === UNAUTHORIZED) {
        setError('Sessão expirada.')
        return
      }
      const anchorRec = dayRecs.find(r => r.filename === meta.filename) ?? null
      setAnchor(anchorRec)
      if (!anchorRec) {
        setError('Gravação não encontrada no dia.')
        return
      }

      // 2. Sem motionId → reproduz o chunk-âncora inteiro.
      if (!motionId) {
        setEvent(null)
        startPlayback([{ recording: anchorRec, fromSeconds: 0, toSeconds: Infinity }])
        return
      }

      // 3. Com motionId → resolve occurred_at + lead/trail e monta o clip.
      const [ev, win] = await Promise.all([
        gateway.getEvent(motionId!),
        gateway.getPlaybackWindow(cameraId!),
      ])
      if (cancelled) return
      if (!ev) {
        setError('Evento não encontrado.')
        return
      }
      setEvent(ev)
      const segs = clipSegments(ev.time, dayRecs, win.lead, win.trail)
      if (segs.length === 0) {
        setError('Sem gravação cobrindo o evento.')
        return
      }
      startPlayback(segs)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [cameraId, recordingId, motionId, startPlayback])

  return (
    <Layout id="video-browser-page" footerId="video-browser-footer" contentClassName="p-4">
      <div id="video-browser-content" className="mx-auto w-full max-w-5xl space-y-4">
        <PageHeader
          id="video-browser-header"
          title="Reprodução"
          subtitle={
            event
              ? formatDateTime(event.time, timezone)
              : anchor
                ? formatDateTime(anchor.start, timezone)
                : undefined
          }
        />
        {error && (
          <div
            id="video-browser-error"
            className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-body text-danger"
          >
            {error}
          </div>
        )}
        <div
          ref={containerRef}
          className="group relative w-full overflow-hidden rounded-lg border border-border bg-black shadow-sm aspect-video"
        >
          {[0, 1].map(i => (
            <video
              key={i}
              id={i === 0 ? 'video-browser-player' : 'video-browser-player-b'}
              ref={el => {
                elsRef.current[i] = el
              }}
              muted={muted}
              playsInline
              preload="auto"
              // Transição sem piscada: os DOIS ficam pintados (opacity-1) e a troca é só
              // por z-index. Se o buffer usasse opacity-0, o browser não pinta o frame do
              // <video> oculto → ao revelar, aparecia 1 frame preto. Mantendo-o visível
              // atrás (occluído pelo ativo, mesmo enquadramento), o incoming já está
              // renderizado no fromSeconds quando vem pra frente.
              className={`absolute inset-0 h-full w-full ${
                activeEl === i ? 'z-10' : 'z-0 pointer-events-none'
              }`}
              onClick={togglePlay}
              onLoadedMetadata={() => onMeta(i)}
              onTimeUpdate={() => onTimeUpdate(i)}
              onEnded={() => onEnded(i)}
            />
          ))}

          {/* Rodapé de controles ÚNICO — persiste através da troca de segmentos. */}
          <div
            id="video-browser-controls"
            data-on-video
            className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          >
            <div
              id="video-browser-seek"
              ref={seekBarRef}
              onPointerDown={onSeekDown}
              onPointerMove={onSeekMove}
              onPointerUp={onSeekUp}
              className="relative flex h-3 cursor-pointer items-center"
              role="slider"
              aria-label="Progresso da reprodução"
              aria-valuemin={0}
              aria-valuemax={Math.round(total)}
              aria-valuenow={Math.round(pos)}
            >
              <div className="h-1 w-full rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${total > 0 ? (pos / total) * 100 : 0}%` }}
                />
              </div>
              <div
                className="absolute h-3 w-3 -translate-x-1/2 rounded-full bg-primary shadow"
                style={{ left: `${total > 0 ? (pos / total) * 100 : 0}%` }}
              />
            </div>
            <div className="flex items-center gap-3 text-white">
              <button
                id="video-browser-playpause"
                type="button"
                onClick={togglePlay}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
                aria-label={playing ? 'Pausar' : 'Reproduzir'}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button
                id="video-browser-repeat"
                type="button"
                onClick={toggleRepeat}
                className={`flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15 ${
                  repeat ? 'text-primary' : ''
                }`}
                aria-label="Repetir"
                aria-pressed={repeat}
              >
                <Repeat className="h-4 w-4" />
              </button>
              <button
                id="video-browser-mute"
                type="button"
                onClick={toggleMute}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15"
                aria-label={muted ? 'Ativar som' : 'Mudo'}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <span className="text-caption tabular-nums text-white/80">
                {formatClock(pos)} / {formatClock(total)}
              </span>
              {segments.length > 1 && (
                <span
                  id="video-browser-segment"
                  aria-label="Segmento atual"
                  className="text-caption tabular-nums text-white/60"
                >
                  {curSeg + 1} / {segments.length}
                </span>
              )}
              <button
                id="video-browser-fullscreen"
                type="button"
                onClick={toggleFullscreen}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15"
                aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              >
                <Maximize className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
