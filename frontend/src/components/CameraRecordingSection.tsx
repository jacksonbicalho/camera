import { useState } from 'react'
import { emptyForm, formToPayload, type Camera, type CameraFormData } from './cameraFormUtils'
import { RecordingFields } from './cameraFormFields'
import { Button } from '@/components/ui/button'
import { authHeaders } from '../auth'

// CameraRecordingSection — sessão "Gravação" de CameraDetailSettingsPage,
// história refactor/camera-detail-secoes-aplicar (T3). Sempre editável, com
// "Aplicar" próprio — mesmo padrão de CameraCaptureSection/MotionFormContent:
// form local snapshot único (não resincroniza com `cam`), payload parcial
// sobre `emptyForm(cam)` fresco (só os campos desta seção mudam).
interface Props {
  cam: Camera
  id: string
  reload: () => void
}

export default function CameraRecordingSection({ cam, id, reload }: Props) {
  const [form, setForm] = useState<CameraFormData>(() => emptyForm(cam))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (field: keyof CameraFormData, value: string | boolean | number) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const payload = {
        ...emptyForm(cam),
        recording_enabled: form.recording_enabled,
        chunk_duration: form.chunk_duration,
        record_video_mode: form.record_video_mode,
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
        Gravação
      </p>
      <form onSubmit={handleSave} className="p-5 flex flex-col gap-4">
        <RecordingFields form={form} set={set} />

        {error && (
          <div className="px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button id="camera-recording-save" type="submit" size="sm" disabled={saving}>
            {saving ? 'Aplicando...' : 'Aplicar'}
          </Button>
          {saved && <span className="text-xs text-green-400">Salvo</span>}
        </div>
      </form>
    </div>
  )
}
