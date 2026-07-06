import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { authHeaders, onUnauthorized } from '../auth'
import { cn } from '@/lib/utils'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import CameraViewTabs from '../components/CameraViewTabs'
import Player from '../components/Player'
import { Maximize, Minimize } from '../components/Icons'

interface Camera {
  id: string
  name: string
  live_transport?: string
  recording_enabled?: boolean
}

// LiveBadges — "AO VIVO" (sempre, é a própria visão ao vivo) + "GRAVANDO"
// (condicional a recording_enabled — mesmo critério "ligado por padrão, só
// esconde se explicitamente false" já usado em CameraPage/CamerasSettingsPage
// pro badge "rec off"). Local ao arquivo — só 1 uso, sem extrair componente.
function LiveBadges({ recordingEnabled }: { recordingEnabled?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        id="live-badge-live"
        className="inline-flex items-center gap-1.5 rounded-full border border-danger/40 bg-danger/15 px-[10px] py-[5px] text-caption font-mono tracking-wide leading-none text-danger"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" />
        AO VIVO
      </span>
      {recordingEnabled !== false && (
        <span
          id="live-badge-recording"
          className="inline-flex items-center gap-1.5 rounded-full border border-recording/40 bg-recording/15 px-[10px] py-[5px] text-caption font-mono tracking-wide leading-none text-recording"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-recording" aria-hidden="true" />
          GRAVANDO
        </span>
      )}
    </span>
  )
}

// LivePage é a página nova (método estrangulamento) do ao-vivo: só o Layout
// (conteúdo + Footer, sem o chrome global do AppLayout) + o HLSPlayer
// (WebRTC-first com fallback HLS). Rota: /live/:cameraId.
export default function LivePage() {
  const { cameraId } = useParams<{ cameraId: string }>()
  const [camera, setCamera] = useState<Camera | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

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

  // O alvo do fullscreen é o wrapper {cabeçalho + player} junto — não só o
  // player — pra o cabeçalho poder flutuar sobre o vídeo em tela cheia (a
  // Fullscreen API só exibe o elemento solicitado e seus descendentes).
  useEffect(() => {
    const onFsChange = () => setFullscreen(document.fullscreenElement === wrapperRef.current)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else wrapperRef.current?.requestFullscreen().catch(() => {})
  }, [])

  return (
    <Layout id="live-page" footerId="live-footer" contentClassName="p-4">
      <div id="live-content" className="mx-auto w-full max-w-5xl space-y-4">
        {error && (
          <div
            id="live-error"
            className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-body text-danger"
          >
            {error}
          </div>
        )}
        {camera && (
          <div ref={wrapperRef} id="live-header-and-player" className="relative">
            <div
              id="live-header"
              data-on-video={fullscreen || undefined}
              className={cn(
                fullscreen
                  ? 'absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-4 py-3'
                  : 'mb-4',
              )}
            >
              <PageHeader
                className="items-center mb-0"
                title={
                  <span className={cn('flex items-center gap-2', fullscreen && 'text-white')}>
                    {camera.name}
                    <LiveBadges recordingEnabled={camera.recording_enabled} />
                  </span>
                }
                actions={
                  <>
                    <CameraViewTabs cameraId={camera.id} active="live" />
                    <button
                      id="live-fullscreen-toggle"
                      type="button"
                      onClick={toggleFullscreen}
                      aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-muted-foreground hover:text-foreground"
                    >
                      {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                    </button>
                  </>
                }
              />
            </div>
            <div
              id="live-player"
              data-on-video
              className="relative w-full overflow-hidden rounded-lg border border-border bg-black shadow-sm aspect-video"
            >
              <Player
                id="live-player-video"
                src={`/stream/${camera.id}/index.m3u8`}
                cameraId={camera.id}
                transport={camera.live_transport}
                muted
                hideFullscreenButton
                className="w-full h-full"
                containerClassName="w-full h-full"
              />
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
