import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { authHeaders, onUnauthorized } from '../auth'
import Layout from '../components/Layout'
import CameraStageHeader from '../components/CameraStageHeader'
import Player from '../components/Player'

interface Camera {
  id: string
  name: string
  live_transport?: string
  recording_enabled?: boolean
}

// LivePage é a página nova (método estrangulamento) do ao-vivo: só o Layout
// (conteúdo + Footer, sem o chrome global do AppLayout) + o HLSPlayer
// (WebRTC-first com fallback HLS). Rota: /live/:cameraId.
export default function LivePage() {
  const { cameraId } = useParams<{ cameraId: string }>()
  const [camera, setCamera] = useState<Camera | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <Layout id="live-page" footerId="live-footer" contentClassName="p-6">
      <div id="live-content" className="page-content space-y-4">
        {error && (
          <div
            id="live-error"
            className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-body text-danger"
          >
            {error}
          </div>
        )}
        {camera && (
          <CameraStageHeader
            idPrefix="live"
            cameraId={camera.id}
            cameraName={camera.name}
            active="live"
            recordingEnabled={camera.recording_enabled}
          >
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
                className="w-full h-full"
                containerClassName="w-full h-full"
              />
            </div>
          </CameraStageHeader>
        )}
      </div>
    </Layout>
  )
}
