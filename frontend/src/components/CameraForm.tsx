import { useRef, useState } from 'react'
import { type Camera, type CameraFormData, emptyForm } from './cameraFormUtils'
import { NameField, CaptureFields, RecordingFields, TransmissionFields } from './cameraFormFields'
import { Button } from '@/components/ui/button'
import { authHeaders } from '../auth'

interface CameraFormProps {
  initial?: Camera
  prefillRtsp?: string
  prefillName?: string
  onSave: (data: CameraFormData) => Promise<void>
  onCancel: () => void
  saving: boolean
}

export default function CameraForm({
  initial,
  prefillRtsp,
  prefillName,
  onSave,
  onCancel,
  saving,
}: CameraFormProps) {
  const [form, setForm] = useState<CameraFormData>(() => {
    const base = emptyForm(initial)
    if (prefillRtsp) base.rtsp_url = prefillRtsp
    if (prefillName) base.name = prefillName
    return base
  })
  // editing mode when `initial` is provided
  const [detectingLive, setDetectingLive] = useState(false)
  const [liveDetectMsg, setLiveDetectMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [liveRecommended, setLiveRecommended] = useState<string>('')
  // Guarda o video_codec de antes de forçar 'h264' pra WebRTC — restaurado ao
  // sair do WebRTC, senão um toggle exploratório perde o valor customizado
  // (ex: hevc) de vez, sem aviso.
  const prevVideoCodecRef = useRef<string | null>(null)

  const set = (field: keyof CameraFormData, value: string | boolean | number) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handleDetectStreams = async () => {
    const main = form.rtsp_url.trim()
    if (!main) return
    setDetectingLive(true)
    setLiveDetectMsg(null)
    try {
      const res = await fetch('/api/settings/cameras/detect-streams', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ rtsp_url: main, id: initial?.id, capture_type: form.capture_type }),
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
        setLiveDetectMsg({
          text: `Codec detectado: ${data.codec.toUpperCase()} — ${rec}`,
          ok: data.recommended === 'webrtc',
        })
      } else {
        setLiveRecommended('')
        setLiveDetectMsg({
          text: 'Não foi possível detectar o codec — verifique a URL principal.',
          ok: false,
        })
      }
    } catch {
      setLiveDetectMsg({ text: 'Erro ao detectar — verifique a URL principal.', ok: false })
    } finally {
      setDetectingLive(false)
    }
  }

  // WebRTC exige H.264 no browser — forçar aqui garante que o HLS pipeline
  // realmente desliga (webrtc.ShouldRunHLS fica determinístico), em vez de
  // depender do stream real corresponder ao rótulo "Auto". O valor anterior é
  // guardado e restaurado ao sair do WebRTC, senão um toggle exploratório
  // perde um codec customizado (ex: hevc) de vez.
  const handleTransportChange = (transport: string) => {
    set('live_transport', transport)
    if (transport === 'webrtc' && form.live_transport !== 'webrtc') {
      prevVideoCodecRef.current = form.video_codec
      set('video_codec', 'h264')
    } else if (transport !== 'webrtc' && form.live_transport === 'webrtc') {
      if (prevVideoCodecRef.current !== null) {
        set('video_codec', prevVideoCodecRef.current)
      }
      prevVideoCodecRef.current = null
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(form)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Nome — sessão própria, sozinha */}
      <NameField form={form} set={set} />

      {/* Captura — sempre visível: propriedades da conexão em si (protocolo, URL,
          stream detectado, política de reconexão) — não de gravação/transmissão/movimento */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <p className="text-h4 text-muted-foreground uppercase tracking-wider font-medium px-5 pt-4 pb-3 border-b border-border">
          Captura
        </p>
        <div className="p-5">
          <CaptureFields form={form} set={set} codecDisabled={form.live_transport === 'webrtc'} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <p className="text-h4 text-muted-foreground uppercase tracking-wider font-medium px-5 pt-4 pb-3 border-b border-border">
            Gravação
          </p>
          <div className="p-5">
            <RecordingFields form={form} set={set} />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <p className="text-h4 text-muted-foreground uppercase tracking-wider font-medium px-5 pt-4 pb-3 border-b border-border">
            Transmissão
          </p>
          <div className="p-5">
            <TransmissionFields
              form={form}
              set={set}
              rtspUrl={form.rtsp_url}
              detecting={detectingLive}
              detectMsg={liveDetectMsg}
              liveRecommended={liveRecommended}
              onDetect={handleDetectStreams}
              onTransportChange={handleTransportChange}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button id="camera-form-save" type="submit" size="sm" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button
          id="camera-form-cancel"
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
