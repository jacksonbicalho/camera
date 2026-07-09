import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Play, Pause, Repeat, Maximize, VolumeX, Volume2, Gauge } from './Icons'
import PlayerControlsOverlay from './PlayerControlsOverlay'
import { usePlayerZoom } from '../hooks/usePlayerZoom'
import { segmentDuration, clipTotal, globalTime, locate, formatClock, shouldAdvance } from '../lib/clipTimeline'

export interface VideoPlayerSegment {
  src: string
  fromSeconds: number
  toSeconds: number // Infinity = até o fim do arquivo
}

// Opções do dropdown de velocidade — potências de 2 até 32x, pensado pra revisão de
// gravação (pular trechos parados rápido), não só o 1.5x/2x de player de mídia comum.
// Ordem de exibição: maior em cima, menor embaixo.
const PLAYBACK_RATES = [32, 16, 8, 4, 2, 1]

// Nem todo browser aceita `playbackRate` tão alto (alguns ignoram/clampam valores acima de
// um teto interno) — detecta suporte real testando num <video> descartável (nunca chega a
// carregar mídia, só o setter/getter do IDL attribute) em vez de assumir que tudo que
// pedimos "pega". Rodado uma vez por sessão (module scope): a capacidade do browser não
// muda entre instâncias do player.
function detectSupportedRates(candidates: number[]): number[] {
  if (typeof document === 'undefined') return candidates
  const probe = document.createElement('video')
  return candidates.filter(rate => {
    try {
      probe.playbackRate = rate
      return probe.playbackRate === rate
    } catch {
      return false
    }
  })
}
const SUPPORTED_PLAYBACK_RATES = detectSupportedRates(PLAYBACK_RATES)

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
  // Dispara sempre que o segmento ativo muda (transição natural, seek manual ou reinício
  // por loop) — a página chamadora usa isso pra saber qual item da playlist está tocando
  // agora sem duplicar índice/lógica própria (ex.: HistoryPage sincronizando a URL durante
  // a reprodução contínua).
  onSegmentChange?: (index: number) => void
  // O contador "N / M" (`${idPrefix}-segment`) só faz sentido quando os segmentos são
  // recortes de UM evento (VideoBrowserPage, `:motionId` explícito na URL) — aí "M" é a
  // quantidade de chunks que aquele clipe atravessa. Quando os segmentos são gravações
  // INTEIRAS e independentes encadeadas (HistoryPage, reprodução contínua), "N / M" não
  // significa nada pro usuário (não é "parte 2 de uma gravação", é "a 2ª de M gravações
  // distintas na lista") — HistoryPage sempre passa `false` aqui, mesmo com >1 segmento.
  segmentCounter?: boolean
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
  onSegmentChange,
  segmentCounter = true,
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
  const rateRef = useRef(1) // velocidade de reprodução (sobrevive à troca de src/segmento)

  const [activeEl, setActiveEl] = useState(0)
  const [curSeg, setCurSeg] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true) // muted p/ liberar autoplay sem gesto
  const [repeatOn, setRepeatOn] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  const speedMenuRef = useRef<HTMLDivElement | null>(null)
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

  const setCurSegTracked = useCallback(
    (idx: number) => {
      setCurSeg(idx)
      onSegmentChange?.(idx)
    },
    [onSegmentChange],
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
      // `playbackRate` não é preservado de forma confiável por todo browser através de
      // `el.load()` (reseta pro default em alguns) — reaplica a cada metadata carregada,
      // inclusive nos segmentos seguintes pré-carregados, pra velocidade escolhida
      // atravessar a fronteira entre gravações no modo contínuo.
      el.playbackRate = rateRef.current
      if (elIdx === activeRef.current && playingRef.current) el.play().catch(() => {})
    },
    [recomputeDurations],
  )

  // activate torna o elemento visível e o toca (já pré-carregado no fromSeconds → sem
  // re-seek, evitando flash). Se ainda não tem metadata, o onMeta tocará ao chegar.
  const activate = useCallback(
    (elIdx: number) => {
      activeRef.current = elIdx
      setActiveEl(elIdx)
      setCurSegTracked(heldSegRef.current[elIdx])
      const el = elsRef.current[elIdx]
      if (el && el.readyState >= 1 && playingRef.current) el.play().catch(() => {})
    },
    [setCurSegTracked],
  )

  // resetToStart volta o clipe pro segmento 0/posição 0 (mantém as durações reais já
  // aprendidas — não recomputa do zero) — usado tanto no loop (`repeat` ligado, autoResume
  // = true, toca de novo na hora) quanto ao chegar no fim sem repeat (autoResume = false:
  // fica pausado no início, pronto pro botão de play — em vez de ficar "preso" mostrando a
  // barra cravada no fim, onde apertar play não reproduz nada porque o <video> já está no
  // seu próprio fim).
  const resetToStart = useCallback(
    (autoResume: boolean) => {
      heldSegRef.current = [-1, -1]
      pendingSeekRef.current = [null, null]
      activeRef.current = 0
      setActiveEl(0)
      setCurSegTracked(0)
      setPos(0)
      setPlayingIntent(autoResume)
      if (zoomEnabled) zoom.reset()
      loadInto(0, 0)
      loadInto(1, 1)
    },
    [loadInto, setPlayingIntent, setCurSegTracked, zoomEnabled, zoom],
  )

  // advance troca para o próximo segmento (que o outro elemento já pré-carregou) e põe o
  // elemento liberado para pré-carregar o segmento seguinte. O zoom reseta na fronteira —
  // o buffer que entra não tinha a transform aplicada (evita "zoom perdido" visualmente
  // errado no vizinho que acabou de ficar visível).
  const advance = useCallback(() => {
    const active = activeRef.current
    const nextSeg = heldSegRef.current[active] + 1
    if (nextSeg >= segmentsRef.current.length) {
      resetToStart(repeatRef.current)
      return
    }
    const other = 1 - active
    if (heldSegRef.current[other] !== nextSeg) loadInto(other, nextSeg)
    activate(other)
    if (zoomEnabled) zoom.reset()
    loadInto(active, nextSeg + 1)
  }, [activate, loadInto, resetToStart, zoomEnabled, zoom])

  const onTimeUpdate = useCallback(
    (elIdx: number) => {
      if (elIdx !== activeRef.current) return
      const el = elsRef.current[elIdx]
      const segIdx = heldSegRef.current[elIdx]
      const seg = segmentsRef.current[segIdx]
      if (!el || !seg) return
      // Corte por toSeconds (trail termina no meio do arquivo) OU chegada perto do fim REAL
      // do arquivo (`shouldAdvance`, `lib/clipTimeline.ts`) — cobre o caso de `toSeconds`
      // (vindo de um timestamp de parede, ex.: `end - start` de uma gravação) ser um pouco
      // MAIOR que a duração de fato reproduzível: sem isso, o avanço dependeria só do
      // evento nativo `ended`, que gravações reais não fragmentadas nem sempre disparam de
      // forma confiável.
      if (shouldAdvance(el.currentTime, seg.toSeconds, el.duration)) {
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
      else resetToStart(repeatRef.current)
    },
    [advance, resetToStart],
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

  // Aplica a velocidade escolhida no dropdown (SUPPORTED_PLAYBACK_RATES) nos dois
  // elementos do buffer duplo (não só o ativo — o pré-carregado também precisa estar na
  // velocidade certa quando assumir o `z-10`, senão a transição pula de velocidade no meio
  // do clipe). 32x já é filtrado do dropdown quando o browser não suporta
  // (SUPPORTED_PLAYBACK_RATES), mas essa é a rede de segurança: se mesmo assim `el.
  // playbackRate` não "pegar" em 32, cai pra 16x em vez de ficar mostrando "32x" tocando
  // numa velocidade diferente.
  const selectPlaybackRate = useCallback((rate: number) => {
    let applied = rate
    elsRef.current.forEach(el => {
      if (!el) return
      el.playbackRate = rate
      if (rate === 32 && el.playbackRate !== 32) applied = 16
    })
    if (applied !== rate) {
      elsRef.current.forEach(el => {
        if (el) el.playbackRate = applied
      })
    }
    rateRef.current = applied
    setPlaybackRate(applied)
    setSpeedMenuOpen(false)
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
        setCurSegTracked(index)
      } else {
        pendingSeekRef.current[active] = fileTime
        loadInto(active, index)
        setCurSegTracked(index)
        loadInto(1 - active, index + 1)
      }
    },
    [loadInto, setCurSegTracked],
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

  // Fecha o dropdown de velocidade ao clicar fora dele — mesmo padrão dos flyouts do resto
  // do app (ex.: Sidebar), só que autocontido aqui (o hook compartilhado é acoplado à
  // posição fixa do rail lateral, não serve pro controle flutuante do player).
  useEffect(() => {
    if (!speedMenuOpen) return
    const onClick = (e: MouseEvent) => {
      if (!speedMenuRef.current?.contains(e.target as Node)) setSpeedMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [speedMenuOpen])

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
      setCurSegTracked(0)
      setPos(0)
      recomputeDurations()
      setPlayingIntent(autoPlay)
      if (zoomEnabled) zoom.reset()
      if (segs.length === 0) return
      loadInto(0, 0)
      loadInto(1, 1)
    },
    [autoPlay, zoomEnabled, zoom, loadInto, recomputeDurations, setPlayingIntent, setCurSegTracked],
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
              <div ref={speedMenuRef} className="relative">
                <button
                  id={`${idPrefix}-speed`}
                  type="button"
                  onClick={() => setSpeedMenuOpen(v => !v)}
                  className={`flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-full px-1.5 hover:bg-white/15 ${
                    playbackRate !== 1 ? 'text-primary' : ''
                  }`}
                  aria-haspopup="listbox"
                  aria-expanded={speedMenuOpen}
                  aria-label="Velocidade de reprodução"
                >
                  <Gauge className="h-4 w-4" />
                  <span className="text-caption tabular-nums">{playbackRate}x</span>
                </button>
                {speedMenuOpen && (
                  <div
                    id={`${idPrefix}-speed-menu`}
                    role="listbox"
                    aria-label="Velocidade de reprodução"
                    className="absolute bottom-full left-1/2 z-30 mb-2 flex -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-white/15 bg-black/90 py-1 shadow-lg"
                  >
                    {SUPPORTED_PLAYBACK_RATES.map(rate => (
                      <button
                        key={rate}
                        id={`${idPrefix}-speed-${rate}`}
                        type="button"
                        role="option"
                        aria-selected={rate === playbackRate}
                        onClick={() => selectPlaybackRate(rate)}
                        className={`px-4 py-1 text-left text-caption tabular-nums hover:bg-white/15 ${
                          rate === playbackRate ? 'text-primary' : 'text-white'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-caption tabular-nums text-white/80">
                {formatClock(pos)} / {formatClock(total)}
              </span>
              {segmentCounter && segments.length > 1 && (
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
