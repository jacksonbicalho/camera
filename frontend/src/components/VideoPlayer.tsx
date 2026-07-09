import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Play, Pause, Repeat, Maximize, VolumeX, Volume2 } from './Icons'
import PlayerControlsOverlay from './PlayerControlsOverlay'
import { usePlayerZoom } from '../hooks/usePlayerZoom'
import { segmentDuration, clipTotal, globalTime, locate, formatClock } from '../lib/clipTimeline'

export interface VideoPlayerSegment {
  src: string
  fromSeconds: number
  toSeconds: number // Infinity = até o fim do arquivo
}

interface VideoPlayerProps {
  segments: VideoPlayerSegment[]
  idPrefix: string
  autoPlay?: boolean
  repeat?: boolean
  zoom?: boolean
  emptyMessage?: string
  onLoadedData?: () => void
  onError?: () => void
  onPlayingChange?: (playing: boolean) => void
  // Conteúdo extra sobreposto ao player (loading/erro/avisos específicos da página) —
  // renderizado por cima de tudo, sempre, independente do estado interno (aditivo).
  overlay?: ReactNode
}

// VideoPlayer — motor de reprodução de N segmentos MP4 em sequência (double-buffering,
// dois <video> empilhados, sem tela preta na fronteira entre chunks — MP4 não-fragmentado,
// MSE não é opção) + barra de controles própria (seek com arraste, play/pause, repeat,
// mute, contador de segmento, fullscreen) e zoom (scroll-to-zoom/drag-to-pan). Extraído do
// VideoBrowserPage para ser reaproveitado pelo HistoryPage — ambos tocam "N segmentos MP4
// com início/fim conhecidos", ao contrário do player ao vivo (Player.tsx — WebRTC/HLS, sem
// seek, modelo de dados diferente e fora de escopo aqui).
export default function VideoPlayer({
  segments,
  idPrefix,
  autoPlay = true,
  repeat = true,
  zoom: zoomEnabled = true,
  emptyMessage,
  onLoadedData,
  onError,
  onPlayingChange,
  overlay,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const seekBarRef = useRef<HTMLDivElement>(null)
  const elsRef = useRef<(HTMLVideoElement | null)[]>([null, null])
  const heldSegRef = useRef<number[]>([-1, -1]) // segmento que cada elemento carrega (-1 = nenhum)
  const pendingSeekRef = useRef<(number | null)[]>([null, null]) // seek a aplicar no onMeta
  const activeRef = useRef(0) // elemento visível/tocando
  const segmentsRef = useRef<VideoPlayerSegment[]>([])
  const realDurRef = useRef<(number | undefined)[]>([]) // duração real de cada segmento (por índice)
  const durationsRef = useRef<number[]>([]) // duração reproduzível de cada segmento
  const playingRef = useRef(false) // intenção de reprodução (sobrevive à troca de src)
  const scrubbingRef = useRef(false)
  const repeatRef = useRef(false) // loop do clipe ao terminar

  const [activeEl, setActiveEl] = useState(0)
  const [curSeg, setCurSeg] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true) // muted p/ liberar autoplay sem gesto
  const [repeatOn, setRepeatOn] = useState(false)
  const [pos, setPos] = useState(0) // posição global (s)
  const [total, setTotal] = useState(0) // duração total do clipe (s)
  const [fullscreen, setFullscreen] = useState(false)

  const getActiveVideoEl = useCallback(() => elsRef.current[activeRef.current], [])
  const zoom = usePlayerZoom(getActiveVideoEl)

  const setPlayingIntent = useCallback(
    (v: boolean) => {
      playingRef.current = v
      setPlaying(v)
      onPlayingChange?.(v)
    },
    [onPlayingChange],
  )

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
    el.src = seg.src
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
    if (zoomEnabled) zoom.reset()
    loadInto(0, 0)
    loadInto(1, 1)
  }, [loadInto, setPlayingIntent, zoomEnabled, zoom])

  // advance troca para o próximo segmento (que o outro elemento já pré-carregou) e põe o
  // elemento liberado para pré-carregar o segmento seguinte. O zoom reseta na fronteira —
  // o buffer que entra não tinha a transform aplicada (evita "zoom perdido" visualmente
  // errado no vizinho que acabou de ficar visível).
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
    if (zoomEnabled) zoom.reset()
    loadInto(active, nextSeg + 1)
  }, [activate, loadInto, restartClip, setPlayingIntent, zoomEnabled, zoom])

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
    setRepeatOn(r => {
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
  const seekGlobal = useCallback(
    (p: number) => {
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
    },
    [loadInto],
  )

  // Barra de progresso própria (div): fração pela posição do ponteiro sobre o track.
  const seekFromClientX = useCallback(
    (clientX: number) => {
      const bar = seekBarRef.current
      if (!bar || total <= 0) return
      const rect = bar.getBoundingClientRect()
      const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      seekGlobal(f * total)
    },
    [seekGlobal, total],
  )

  const onSeekDown = useCallback(
    (e: React.PointerEvent) => {
      scrubbingRef.current = true
      e.currentTarget.setPointerCapture?.(e.pointerId)
      seekFromClientX(e.clientX)
    },
    [seekFromClientX],
  )

  const onSeekMove = useCallback(
    (e: React.PointerEvent) => {
      if (scrubbingRef.current) seekFromClientX(e.clientX)
    },
    [seekFromClientX],
  )

  const onSeekUp = useCallback((e: React.PointerEvent) => {
    scrubbingRef.current = false
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }, [])

  const bindContainer = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node
      if (zoomEnabled) zoom.setContainer(node)
    },
    [zoomEnabled, zoom],
  )

  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // startPlayback (re)inicia o motor com uma nova playlist de segmentos (troca de
  // gravação/evento) — recarrega os dois elementos do zero.
  const startPlayback = useCallback(
    (segs: VideoPlayerSegment[]) => {
      segmentsRef.current = segs
      realDurRef.current = new Array(segs.length)
      heldSegRef.current = [-1, -1]
      pendingSeekRef.current = [null, null]
      activeRef.current = 0
      setActiveEl(0)
      setCurSeg(0)
      setPos(0)
      recomputeDurations()
      setPlayingIntent(autoPlay)
      if (zoomEnabled) zoom.reset()
      if (segs.length === 0) return
      loadInto(0, 0)
      loadInto(1, 1)
    },
    [autoPlay, zoomEnabled, zoom, loadInto, recomputeDurations, setPlayingIntent],
  )

  // A página chamadora precisa manter `segments` com referência estável (useMemo/useState)
  // entre renders que não mudam a playlist, senão esse efeito dispara à toa a cada render.
  //
  // startPlayback também seta os <video> reais (loadInto → el.src/el.load()), então só pode
  // rodar depois do commit (refs anexados) — não dá pra virar "ajuste durante o render". O
  // react-hooks/set-state-in-effect não distingue esse caso do anti-padrão de estado
  // derivado que a regra normalmente pega (a checagem é sintática: qualquer setState
  // alcançável a partir do corpo do efeito, mesmo indireto via helper, dispara — só escapa
  // se vier depois de um `await`).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startPlayback(segments)
  }, [segments, startPlayback])

  const hasSegments = segments.length > 0

  return (
    <div
      id={idPrefix}
      ref={bindContainer}
      onPointerDown={zoomEnabled ? zoom.onPointerDown : undefined}
      onPointerMove={zoomEnabled ? zoom.onPointerMove : undefined}
      onPointerUp={zoomEnabled ? zoom.onPointerUp : undefined}
      data-on-video
      className={`group relative w-full overflow-hidden rounded-lg border border-border bg-black shadow-sm aspect-video${
        zoomEnabled && zoom.isZoomed ? ' cursor-grab' : ''
      }`}
    >
      {hasSegments ? (
        <>
          {[0, 1].map(i => (
            <video
              key={i}
              id={i === 0 ? `${idPrefix}-video` : `${idPrefix}-video-b`}
              ref={el => {
                elsRef.current[i] = el
              }}
              muted={muted}
              playsInline
              preload="auto"
              // Transição sem piscada: os DOIS ficam pintados (opacity-1) e a troca é só
              // por z-index — ver comentário original no VideoBrowserPage (removido daqui
              // por brevidade, motivo documentado no cabeçalho do arquivo).
              className={`absolute inset-0 h-full w-full ${
                activeEl === i ? 'z-10' : 'z-0 pointer-events-none'
              }`}
              onClick={togglePlay}
              onLoadedMetadata={() => onMeta(i)}
              onLoadedData={() => {
                if (i === activeRef.current) onLoadedData?.()
              }}
              onTimeUpdate={() => onTimeUpdate(i)}
              onEnded={() => onEnded(i)}
              onPlay={() => {
                if (i === activeRef.current) setPlayingIntent(true)
              }}
              onPause={() => {
                if (i === activeRef.current) setPlayingIntent(false)
              }}
              onError={() => {
                if (i === activeRef.current) onError?.()
              }}
            />
          ))}

          {zoomEnabled && <PlayerControlsOverlay id={idPrefix} zoom={zoom} />}

          {/* Rodapé de controles ÚNICO — persiste através da troca de segmentos. */}
          <div
            id={`${idPrefix}-controls`}
            data-on-video
            className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          >
            <div
              id={`${idPrefix}-seek`}
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
                id={`${idPrefix}-playpause`}
                type="button"
                onClick={togglePlay}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
                aria-label={playing ? 'Pausar' : 'Reproduzir'}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              {repeat && (
                <button
                  id={`${idPrefix}-repeat`}
                  type="button"
                  onClick={toggleRepeat}
                  className={`flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15 ${
                    repeatOn ? 'text-primary' : ''
                  }`}
                  aria-label="Repetir"
                  aria-pressed={repeatOn}
                >
                  <Repeat className="h-4 w-4" />
                </button>
              )}
              <button
                id={`${idPrefix}-mute`}
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
                  id={`${idPrefix}-segment`}
                  aria-label="Segmento atual"
                  className="text-caption tabular-nums text-white/60"
                >
                  {curSeg + 1} / {segments.length}
                </span>
              )}
              <button
                id={`${idPrefix}-fullscreen`}
                type="button"
                onClick={toggleFullscreen}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15"
                aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              >
                <Maximize className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      ) : (
        emptyMessage && (
          <div className="flex h-full items-center justify-center text-body text-muted">{emptyMessage}</div>
        )
      )}
      {overlay}
    </div>
  )
}
