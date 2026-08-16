import { useState } from 'react'
import { emptyForm, formToPayload, type Camera, type CameraFormData } from './cameraFormUtils'
import { TransmissionFields } from './cameraFormFields'
import { ApplyButton } from '@/components/ui/apply-button'
import { authHeaders } from '../auth'

// CameraTransmissionSection — sessão "Transmissão" de CameraDetailSettingsPage,
// história refactor/camera-detail-secoes-aplicar (T3). Sempre editável, com
// "Aplicar" próprio — mesmo padrão de CameraCaptureSection/MotionFormContent.
//
// "Detectar" usa `cam.rtsp_url` (fresco, prop), não `form.rtsp_url` — o campo
// RTSP mora agora numa seção DIFERENTE (Captura), então um form local aqui
// nunca teria acesso à URL atual mesmo que ela tivesse sido editada e salva
// depois desta seção montar; mesmo motivo de
// MotionFormContent.handleDetectSubstream já usar `cam.rtsp_url`.
//
// **É esta seção que garante a invariante "webrtc ⇒ video_codec=h264"**
// (webrtc.ShouldRunHLS só desliga o pipeline HLS quando o codec RESOLVIDO é
// h264): ao aplicar com `live_transport==='webrtc'`, o payload força
// `video_codec:'h264'` no PRÓPRIO save, independente do que a seção Captura
// tenha local/não-salvo no momento — CameraCaptureSection reflete esse
// estado via `codecDisabled` derivado de `cam.live_transport`, mas é aqui que
// a invariante é de fato estabelecida no backend. Ao SAIR do webrtc, esta
// seção não mexe em `video_codec` — a restauração automática do codec
// customizado anterior (que existia no antigo form único) foi descontinuada:
// com os saves independentes, esta seção não tem mais acesso ao form local
// de Captura pra restaurar algo; o usuário escolhe o codec de novo lá,
// depois de sair do WebRTC, se quiser.
interface Props {
  cam: Camera
  id: string
  reload: () => void
}

export default function CameraTransmissionSection({ cam, id, reload }: Props) {
  const [form, setForm] = useState<CameraFormData>(() => emptyForm(cam))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [detectMsg, setDetectMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [liveRecommended, setLiveRecommended] = useState('')

  const set = (field: keyof CameraFormData, value: string | boolean | number) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handleTransportChange = (transport: string) => set('live_transport', transport)

  const handleDetectStreams = async () => {
    const main = cam.rtsp_url.trim()
    if (!main) return
    setDetecting(true)
    setDetectMsg(null)
    try {
      const res = await fetch('/api/settings/cameras/detect-streams', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ rtsp_url: main, id: cam.id, capture_type: cam.capture_type }),
      })
      if (!res.ok) throw new Error('request failed')
      const data = (await res.json()) as {
        codec?: string
        width?: number
        height?: number
        recommended?: string
      }
      if (data.codec) {
        setLiveRecommended(data.recommended ?? '')
        const rec =
          data.recommended === 'webrtc'
            ? 'WebRTC recomendado (baixa latência)'
            : 'HLS recomendado — WebRTC indisponível para este codec'
        setDetectMsg({
          text: `Codec detectado: ${data.codec.toUpperCase()} — ${rec}`,
          ok: data.recommended === 'webrtc',
        })
      } else {
        setLiveRecommended('')
        setDetectMsg({
          text: 'Não foi possível detectar o codec — verifique a URL principal.',
          ok: false,
        })
      }
    } catch {
      setDetectMsg({ text: 'Erro ao detectar — verifique a URL principal.', ok: false })
    } finally {
      setDetecting(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const payload = {
        ...emptyForm(cam),
        live_enabled: form.live_enabled,
        live_transport: form.live_transport,
        hls_video_mode: form.hls_video_mode,
        hls_segment_seconds_default: form.hls_segment_seconds_default,
        hls_segment_seconds: form.hls_segment_seconds,
        hls_list_size_default: form.hls_list_size_default,
        hls_list_size: form.hls_list_size,
        hls_dvr_seconds: form.hls_dvr_seconds,
        ...(form.live_transport === 'webrtc' ? { video_codec: 'h264' } : {}),
      }
      const res = await fetch(`/api/settings/cameras/${id}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(formToPayload(payload)),
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Erro ao salvar')
        return
      }
      setSaved(true)
      reload()
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <p className="text-h4 text-muted-foreground uppercase tracking-wider font-medium px-5 pt-4 pb-3 border-b border-border">
        Transmissão
      </p>
      <form onSubmit={handleSave} className="p-5 flex flex-col gap-4">
        <TransmissionFields
          form={form}
          set={set}
          rtspUrl={cam.rtsp_url}
          detecting={detecting}
          detectMsg={detectMsg}
          liveRecommended={liveRecommended}
          onDetect={handleDetectStreams}
          onTransportChange={handleTransportChange}
        />

        {error && (
          <div className="px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <ApplyButton id="camera-transmission-save" saving={saving} />
          {saved && <span className="text-xs text-green-400">Salvo</span>}
        </div>
      </form>
    </div>
  )
}
