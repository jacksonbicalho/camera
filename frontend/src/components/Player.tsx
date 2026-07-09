import { useCallback, useEffect, useRef, useState } from 'react'
import type HlsType from 'hls.js'
import { getToken } from '../auth'
import { negotiateWebRTC } from '../lib/webrtc'
import { usePlayerZoom } from '../hooks/usePlayerZoom'
import { Loader2, Play } from './Icons'
import PlayerControlsOverlay from './PlayerControlsOverlay'
import { retryPlan } from './playerRetry'

interface PlayerProps {
  src: string
  cameraId?: string
  transport?: string
  muted?: boolean
  id?: string
  className?: string
  containerClassName?: string
}

// Player — player de live enxuto para as páginas novas (estrangulamento):
// WebRTC-first com fallback automático para HLS, autoplay mudo, overlays de
// loading/tap-to-play e retry com backoff+teto. Sem o baggage do HLSPlayer
// (SSE de motion, overlay de movimento, imperative handle).
export default function Player({
  src,
  cameraId,
  transport,
  muted = true,
  id = 'player-video',
  className,
  containerClassName,
}: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const hlsRef = useRef<HlsType | null>(null)
  const mutedRef = useRef(muted)
  const attemptRef = useRef(0)
  const retryRef = useRef<(() => void) | null>(null)
  const [playBlocked, setPlayBlocked] = useState(false)
  const [fatalError, setFatalError] = useState(false)
  const [noSignal, setNoSignal] = useState(false)
  const [connecting, setConnecting] = useState(true)

  const zoom = usePlayerZoom(() => videoRef.current)
  const bindZoom = zoom.setContainer
  const setContainer = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node
      bindZoom(node)
    },
    [bindZoom],
  )
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else containerRef.current?.requestFullscreen().catch(() => {})
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let hls: HlsType | undefined
    let cancelled = false
    let pc: RTCPeerConnection | null = null
    let watchdog: ReturnType<typeof setTimeout> | undefined

    const tryPlay = (v: HTMLVideoElement) => {
      v.muted = mutedRef.current
      v.play()
        .then(() => {
          if (!cancelled) setPlayBlocked(false)
        })
        .catch((err: unknown) => {
          if (!cancelled && (err as { name?: string })?.name !== 'AbortError') setPlayBlocked(true)
        })
    }

    // Conexão bem-sucedida zera o backoff — o loading só some quando o <video>
    // realmente tem um frame pra mostrar (onLoadedData), não neste momento: entre
    // "conectado" (WebRTC/HLS) e o 1º frame decodificado ainda passa um tempo de
    // tela preta, e o loading precisa cobrir esse intervalo todo.
    const onConnected = () => {
      attemptRef.current = 0
    }

    function setupHLS(v: HTMLVideoElement) {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return
        if (!Hls.isSupported()) {
          v.src = src
          return
        }
        hlsRef.current = hls = new Hls({
          maxBufferLength: 10,
          lowLatencyMode: false,
          manifestLoadingMaxRetry: 4,
          manifestLoadingRetryDelay: 2000,
          xhrSetup(xhr) {
            xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`)
          },
        })
        hls.loadSource(src)
        hls.attachMedia(v)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          onConnected()
          tryPlay(v)
        })
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            hls?.destroy()
            hls = undefined
            setFatalError(true)
          }
        })
      })
    }

    async function setup(v: HTMLVideoElement) {
      setFatalError(false)
      setNoSignal(false)
      setPlayBlocked(false)
      setConnecting(true)
      v.muted = true

      if (transport !== 'hls' && cameraId && typeof RTCPeerConnection !== 'undefined') {
        const conn = new RTCPeerConnection()
        pc = conn
        let fellBack = false
        const fallback = () => {
          if (fellBack || cancelled) return
          fellBack = true
          if (watchdog) clearTimeout(watchdog)
          try {
            conn.close()
          } catch {
            /* noop */
          }
          if (pc === conn) pc = null
          v.srcObject = null
          setupHLS(v)
        }

        conn.ontrack = (ev) => {
          const [stream] = ev.streams
          if (stream) v.srcObject = stream
        }
        conn.addTransceiver('video', { direction: 'recvonly' })

        try {
          await negotiateWebRTC(cameraId, conn, { token: getToken() ?? undefined })
        } catch {
          fallback()
          return
        }
        if (cancelled) {
          conn.close()
          return
        }

        conn.onconnectionstatechange = () => {
          if (conn.connectionState === 'connected') {
            if (watchdog) clearTimeout(watchdog)
            onConnected()
            tryPlay(v)
          } else if (conn.connectionState === 'failed') {
            fallback()
          }
        }
        watchdog = setTimeout(() => {
          if (conn.connectionState !== 'connected') fallback()
        }, 5000)
        if (conn.connectionState === 'connected') {
          if (watchdog) clearTimeout(watchdog)
          onConnected()
          tryPlay(v)
        }
        return
      }

      setupHLS(v)
    }

    retryRef.current = () => setup(video)
    setup(video)

    return () => {
      cancelled = true
      if (watchdog) clearTimeout(watchdog)
      hls?.destroy()
      hlsRef.current = null
      if (pc) {
        try {
          pc.close()
        } catch {
          /* noop */
        }
        pc = null
      }
      video.srcObject = null
    }
  }, [src, cameraId, transport])

  useEffect(() => {
    mutedRef.current = muted
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  // Retry com backoff + teto: em erro fatal reagenda o setup com atraso crescente;
  // atingido o teto de tentativas, mostra "Sem sinal" em vez de martelar.
  useEffect(() => {
    if (!fatalError) return
    const { delay, giveUp } = retryPlan(attemptRef.current)
    if (giveUp) {
      setNoSignal(true)
      return
    }
    const timer = setTimeout(() => {
      attemptRef.current += 1
      setFatalError(false)
      retryRef.current?.()
    }, delay)
    return () => clearTimeout(timer)
  }, [fatalError])

  const restart = () => {
    attemptRef.current = 0
    setNoSignal(false)
    setFatalError(false)
    retryRef.current?.()
  }

  return (
    <div
      ref={setContainer}
      onPointerDown={zoom.onPointerDown}
      onPointerMove={zoom.onPointerMove}
      onPointerUp={zoom.onPointerUp}
      className={`group relative overflow-hidden${zoom.isZoomed ? ' cursor-grab' : ''}${containerClassName ? ` ${containerClassName}` : ''}`}
    >
      <video
        id={id}
        ref={videoRef}
        className={className}
        autoPlay
        muted
        playsInline
        onLoadedData={() => setConnecting(false)}
      />

      <PlayerControlsOverlay id={id} zoom={zoom} onToggleFullscreen={toggleFullscreen} />

      {noSignal ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white">
          <span className="text-body">Sem sinal</span>
          <button
            onClick={restart}
            className="rounded bg-white/15 px-3 py-1 text-caption hover:bg-white/25"
            aria-label="Tentar de novo"
          >
            Tentar de novo
          </button>
        </div>
      ) : fatalError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <Loader2 className="w-8 h-8 text-white/70 animate-spin" />
        </div>
      ) : connecting ? (
        <div
          id={`${id}-loading`}
          className="absolute inset-0 flex items-center justify-center bg-black/70"
        >
          <Loader2 className="w-8 h-8 text-white/70 animate-spin" />
        </div>
      ) : playBlocked ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            videoRef.current?.play().catch(() => {})
            setPlayBlocked(false)
          }}
          className="absolute inset-0 flex items-center justify-center bg-black/50 hover:bg-black/40 transition-colors"
          aria-label="Reproduzir"
        >
          <Play className="w-12 h-12 text-white/80 fill-current" />
        </button>
      ) : null}
    </div>
  )
}
