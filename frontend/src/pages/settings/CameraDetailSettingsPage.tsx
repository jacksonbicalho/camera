import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import SettingsSection from '../../components/SettingsSection'
import CameraSettingsTabs from '../../components/CameraSettingsTabs'
import DeviceInfoPanel from '../../components/DeviceInfoPanel'
import CameraCaptureSection from '../../components/CameraCaptureSection'
import CameraRecordingSection from '../../components/CameraRecordingSection'
import CameraTransmissionSection from '../../components/CameraTransmissionSection'
import { MotionFormContent, MotionReadOnly } from '../../components/CameraMotionSection'
import CameraAnalysisSection from '../../components/CameraAnalysisSection'
import { type Camera } from '../../components/cameraFormUtils'
import { useSettings, type CameraSettings } from '../../hooks/useSettings'
import { useMotionPeak } from '../../hooks/useMotionPeak'
import { authHeaders, getRole } from '../../auth'

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

// CameraCaptureView — espelha as sessões Captura/Gravação/Transmissão,
// "fechadas" (read-only) — usado SÓ pelo papel viewer (branch admin usa as
// seções sempre-editáveis CameraCaptureSection/CameraRecordingSection/
// CameraTransmissionSection, ver abaixo — história refactor/camera-detail-
// secoes-aplicar removeu o toggle visualização/edição pro admin).
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
  const { settings, reload } = useSettings()
  const cam = settings?.cameras.find((c) => c.id === id) as Camera | undefined
  const peak = useMotionPeak(id)

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
      <PageHeader title="Câmeras" subtitle={cam?.name ?? '...'} />
      <CameraSettingsTabs id={id!} active="detail" />

      {!settings ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : !cam ? (
        <p className="text-muted-foreground text-sm">Câmera não encontrada.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <SettingsSection title="Identificação" fields={[{ label: 'ID', value: cam.id }]} />
          <CameraCaptureSection cam={cam} id={id!} reload={reload} />
          <CameraRecordingSection cam={cam} id={id!} reload={reload} />
          <CameraTransmissionSection cam={cam} id={id!} reload={reload} />
          <MotionFormContent cam={cam} id={id!} peak={peak} reload={reload} />
          <CameraAnalysisSection id={id!} />
          <DeviceInfoPanel cameraId={id!} isAdmin={isAdmin} />
        </div>
      )}
    </SettingsLayout>
  )
}
