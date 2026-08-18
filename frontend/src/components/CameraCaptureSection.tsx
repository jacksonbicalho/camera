import { useState } from 'react'
import { emptyForm, formToPayload, type Camera, type CameraFormData } from './cameraFormUtils'
import { NameField, CaptureFields } from './cameraFormFields'
import { ApplyButton } from '@/components/ui/apply-button'
import { authHeaders } from '../auth'

// CameraCaptureSection — sessão "Nome e Captura" de CameraDetailSettingsPage,
// história refactor/camera-detail-secoes-aplicar (T2). Sempre editável, com
// "Aplicar" próprio — mesmo padrão que MotionFormContent já usa nesta
// página, generalizado a pedido do navigator (antes, Nome e
// Captura viviam dentro do form único CameraForm, atrás de um botão "Editar"
// que alternava a página inteira entre visualização/edição).
//
// Form local é um snapshot único de `cam` (useState(() => emptyForm(cam)),
// não resincroniza) — mesmo motivo de MotionFormContent: a seção fica
// montada o tempo todo, sem remount ao entrar/sair de nenhum modo. `handleSave`
// NUNCA envia o `form` inteiro: parte de `emptyForm(cam)` (dados atuais de
// verdade) e sobrepõe só os campos que esta sessão edita — salvar aqui nunca
// reverte silenciosamente uma edição feita em outra sessão (Gravação/
// Transmissão) nesse meio-tempo.
//
// `codecDisabled` é derivado do `cam.live_transport` PERSISTIDO (prop, não
// de um form de outra seção em edição) — é a sessão Transmissão que garante
// a invariante "webrtc ⇒ h264" no PRÓPRIO save dela (ver
// CameraTransmissionSection); aqui só refletimos o estado já salvo.
interface Props {
  cam: Camera
  id: string
  reload: () => void
}

export default function CameraCaptureSection({ cam, id, reload }: Props) {
  const [form, setForm] = useState<CameraFormData>(() => emptyForm(cam))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (field: keyof CameraFormData, value: string | boolean | number) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const codecDisabled = (cam.live_transport ?? 'auto') === 'webrtc'

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const payload = {
        ...emptyForm(cam),
        name: form.name,
        rtsp_url: form.rtsp_url,
        capture_type: form.capture_type,
        video_codec: codecDisabled ? 'h264' : form.video_codec,
        has_audio: form.has_audio,
        resolution: form.resolution,
        reconnect_interval: form.reconnect_interval,
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
        Nome e Captura
      </p>
      <form onSubmit={handleSave} className="p-5 flex flex-col gap-4">
        <NameField form={form} set={set} />
        <CaptureFields form={form} set={set} codecDisabled={codecDisabled} />

        {error && (
          <div className="px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <ApplyButton id="camera-capture-save" saving={saving} />
          {saved && <span className="text-xs text-green-400">Salvo</span>}
        </div>
      </form>
    </div>
  )
}
