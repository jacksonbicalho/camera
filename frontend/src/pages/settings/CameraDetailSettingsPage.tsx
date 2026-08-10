import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import SettingsSection from '../../components/SettingsSection'
import CameraForm from '../../components/CameraForm'
import CameraSettingsTabs from '../../components/CameraSettingsTabs'
import EntitySubtitle from '../../components/EntitySubtitle'
import DeviceInfoPanel from '../../components/DeviceInfoPanel'
import { MotionFormContent, MotionReadOnly } from '../../components/CameraMotionSection'
import CameraAnalysisSection from '../../components/CameraAnalysisSection'
import { type CameraFormData, type Camera, formToPayload } from '../../components/cameraFormUtils'
import { useSettings, type CameraSettings } from '../../hooks/useSettings'
import { useMotionPeak } from '../../hooks/useMotionPeak'
import { authHeaders, getRole } from '../../auth'
import { Button } from '@/components/ui/button'

function fmtHasAudio(v: boolean | null): string {
  if (v === null) return 'auto'
  return v ? 'sim' : 'não'
}

function fmtResolution(w: number, h: number): string {
  if (w === 0 && h === 0) return 'auto'
  return `${w} × ${h}`
}

function fmtVideoMode(v: string): string {
  if (v === 'h264') return 'H.264 (sempre transcodifica)'
  if (v === 'copy') return 'Cópia (sem transcodificação)'
  return 'Auto'
}

function fmtLiveTransport(v: string): string {
  if (v === 'webrtc') return 'WebRTC — baixa latência'
  if (v === 'hls') return 'HLS — compatível'
  return 'Automático — WebRTC com fallback HLS'
}

// Campos comuns exibidos nas sessões Captura/Gravação/Transmissão — Camera
// (admin, cameraFormUtils) e CameraSettings (viewer, useSettings) têm os
// mesmos campos, então a mesma view read-only atende os dois papéis.
interface CameraViewFields {
  capture_type?: string
  rtsp_url: string
  video_codec: string
  has_audio: boolean | null
  width: number
  height: number
  reconnect_interval: string
  recording_enabled: boolean
  chunk_duration: string
  record_video_mode: string
  live_enabled?: boolean
  live_transport?: string
  hls_video_mode: string
  hls_segment_seconds: number | null
  hls_list_size: number | null
  hls_dvr_seconds: number | null
}

// CameraCaptureView — espelha as sessões Captura/Gravação/Transmissão de
// CameraForm.tsx, só que "fechadas" (read-only, mesmos campos/condicionais que
// o form usa, em vez do agrupamento antigo Vídeo/Transmissão ao vivo/Gravação
// que não correspondia mais à configuração real — feedback do navigator).
function CameraCaptureView({ cam }: { cam: CameraViewFields }) {
  const captureType = cam.capture_type ?? 'rtsp'
  const liveEnabled = cam.live_enabled ?? true
  const liveTransport = cam.live_transport ?? 'auto'
  return (
    <>
      <SettingsSection
        title="Captura"
        groups={[
          [
            { label: 'Protocolo', value: captureType === 'hls' ? 'HLS' : 'RTSP' },
            { label: captureType === 'hls' ? 'URL HLS' : 'URL RTSP', value: cam.rtsp_url },
          ],
          [
            { label: 'Codec de vídeo', value: cam.video_codec || 'auto' },
            { label: 'Áudio', value: fmtHasAudio(cam.has_audio) },
          ],
          [
            { label: 'Resolução', value: fmtResolution(cam.width, cam.height) },
            { label: 'Intervalo de reconexão', value: cam.reconnect_interval },
          ],
        ]}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SettingsSection
          title="Gravação"
          fields={
            cam.recording_enabled
              ? [
                  { label: 'Gravar em disco', value: 'Sim' },
                  { label: 'Duração do chunk', value: cam.chunk_duration },
                  { label: 'Modo de gravação', value: fmtVideoMode(cam.record_video_mode) },
                ]
              : [{ label: 'Gravar em disco', value: 'Não' }]
          }
        />
        <SettingsSection
          title="Transmissão"
          fields={
            !liveEnabled
              ? [{ label: 'Permitir transmissão', value: 'Não' }]
              : liveTransport === 'webrtc'
                ? [
                    { label: 'Permitir transmissão', value: 'Sim' },
                    { label: 'Transporte', value: fmtLiveTransport(liveTransport) },
                    { label: 'HLS', value: 'Desligado — WebRTC com H.264 não usa HLS' },
                  ]
                : [
                    { label: 'Permitir transmissão', value: 'Sim' },
                    { label: 'Transporte', value: fmtLiveTransport(liveTransport) },
                    { label: 'Modo de vídeo HLS', value: fmtVideoMode(cam.hls_video_mode) },
                    {
                      label: 'Duração do segmento',
                      value:
                        cam.hls_segment_seconds != null
                          ? `${cam.hls_segment_seconds} s`
                          : 'padrão (2 s)',
                    },
                    {
                      label: 'Janela de reprodução',
                      value:
                        cam.hls_list_size != null
                          ? `${cam.hls_list_size} segmentos`
                          : 'padrão (5 segmentos)',
                    },
                    {
                      label: 'Retenção DVR',
                      value: cam.hls_dvr_seconds ? `${cam.hls_dvr_seconds} s` : 'desativado',
                    },
                  ]
          }
        />
      </div>
    </>
  )
}

export default function CameraDetailSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const isAdmin = getRole() === 'admin'
  const location = useLocation()
  const navigate = useNavigate()
  // Edição tem URL própria (/settings/cameras/edit/:id). `editing` é DERIVADO da
  // rota — navegar p/ a URL de edição não remonta o componente, então não pode
  // depender de useState inicial; deriva direto da location.
  const editing = isAdmin && location.pathname.startsWith('/settings/cameras/edit/')
  const { settings, reload } = useSettings()
  const cam = settings?.cameras.find((c) => c.id === id) as Camera | undefined
  const peak = useMotionPeak(id)

  const stopEditing = () => {
    setError(null)
    navigate(`/settings/cameras/${id}`)
  }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [viewerCam, setViewerCam] = useState<CameraSettings | null>(null)
  const [viewerLoading, setViewerLoading] = useState(!isAdmin)

  useEffect(() => {
    if (isAdmin || !id) return
    fetch('/api/cameras', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((cams: CameraSettings[]) => setViewerCam(cams.find((c) => c.id === id) ?? null))
      .catch(() => {})
      .finally(() => setViewerLoading(false))
  }, [isAdmin, id])

  const handleUpdate = async (data: CameraFormData) => {
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/settings/cameras/${id}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(formToPayload(data)),
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Erro ao atualizar câmera')
        return
      }
      reload()
      stopEditing()
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <SettingsLayout id="camera-detail-page" footerId="camera-detail-footer">
        <PageHeader title="Câmeras" subtitle={viewerCam?.name ?? '...'} />
        <CameraSettingsTabs id={id!} active="detail" />
        {viewerLoading ? (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        ) : !viewerCam ? (
          <p className="text-muted-foreground text-sm">Câmera não encontrada.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <SettingsSection
              title="Identificação"
              fields={[
                { label: 'ID', value: viewerCam.id },
                { label: 'Nome', value: viewerCam.name },
              ]}
            />
            <CameraCaptureView cam={viewerCam} />
            <MotionReadOnly cam={viewerCam} id={id!} peak={peak} />
            <DeviceInfoPanel cameraId={id!} isAdmin={false} />
          </div>
        )}
      </SettingsLayout>
    )
  }

  return (
    <SettingsLayout id="camera-detail-page" footerId="camera-detail-footer">
      <PageHeader
        title="Câmeras"
        subtitle={
          editing ? (
            <EntitySubtitle
              parent={{ label: cam?.name ?? '...', to: `/settings/cameras/${id}` }}
              current="Editar"
            />
          ) : (
            (cam?.name ?? '...')
          )
        }
        actions={
          settings && cam && !editing ? (
            <Button
              id="camera-edit"
              variant="outline"
              size="sm"
              onClick={() => navigate(`/settings/cameras/edit/${id}`)}
            >
              Editar
            </Button>
          ) : undefined
        }
      />
      <CameraSettingsTabs id={id!} active="detail" />

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {!settings ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : !cam ? (
        <p className="text-muted-foreground text-sm">Câmera não encontrada.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {editing ? (
            <CameraForm
              initial={cam}
              onSave={handleUpdate}
              onCancel={stopEditing}
              saving={saving}
            />
          ) : (
            <>
              <SettingsSection
                title="Identificação"
                fields={[
                  { label: 'Nome', value: cam.name },
                  { label: 'ID', value: cam.id },
                ]}
              />
              <CameraCaptureView cam={cam} />
            </>
          )}
          <MotionFormContent cam={cam} id={id!} peak={peak} reload={reload} />
          <CameraAnalysisSection id={id!} />
          <DeviceInfoPanel cameraId={id!} isAdmin={isAdmin} />
        </div>
      )}
    </SettingsLayout>
  )
}
