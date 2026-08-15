import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { TelegramIcon } from '@/components/TelegramIcon'
import { authHeaders } from '../auth'

// MotionTelegramNotify — bloco de opt-in de notificação de movimento via
// Telegram, montado dentro de CameraMotionSection (MotionFormContent e
// MotionReadOnly). Preferência POR (usuário, câmera) — estado e "Aplicar"
// próprios, independentes do form/payload de câmera (mesmo padrão de
// MotionFormContent/CameraCaptureSection: cada sessão tem seu save).
//
// Só renderiza com as 3 condições cumulativas (nunca uma CTA de vínculo
// aqui — vincular Telegram é só em Perfil): motion habilitado na câmera,
// extensão Telegram ativa na instância, e o próprio usuário já com Telegram
// vinculado. Falhas de rede degradam para oculto (fail-safe).

const inputClass =
  'w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-ring'
const labelClass = 'block text-xs text-muted-foreground mb-1'

interface Props {
  cameraId: string
  motionEnabled: boolean
}

export function MotionTelegramNotify({ cameraId, motionEnabled }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [telegramActive, setTelegramActive] = useState(false)
  const [telegramLinked, setTelegramLinked] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [minScore, setMinScore] = useState('0.02')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // motionEnabled=false already renders null below regardless of `loaded` —
    // no need to reset it here (would be a synchronous setState in the effect
    // body, barred by react-hooks/set-state-in-effect).
    if (!motionEnabled) {
      return
    }
    let cancelled = false
    async function load() {
      // Reseta explicitamente a cada tentativa (o effect roda de novo a cada
      // troca de cameraId/motionEnabled — MotionFormContent/MotionReadOnly não
      // remontam ao trocar de câmera, então uma instância que já falhou uma
      // vez precisa poder se recuperar, e não ficar oculta pra sempre).
      setLoadFailed(false)
      try {
        // Qualquer uma das duas chamadas falhando (exceção OU resposta não-ok)
        // precisa ficar igualmente "oculto" — nunca renderizar o bloco com
        // enabled/min_score no default enquanto telegramActive/telegramLinked
        // já vieram true da 1ª chamada: um "Aplicar" nesse estado sobrescreveria
        // silenciosamente uma preferência real já salva (achado do code review).
        const prefsRes = await fetch('/api/me/preferences', { headers: authHeaders() })
        if (!prefsRes || !prefsRes.ok) throw new Error('failed to load preferences')
        const prefs = (await prefsRes.json()) as {
          telegram_active?: boolean
          telegram_linked?: boolean
        }
        if (cancelled) return
        setTelegramActive(prefs.telegram_active ?? false)
        setTelegramLinked(prefs.telegram_linked ?? false)

        const notifyRes = await fetch(`/api/cameras/${cameraId}/telegram-notify`, {
          headers: authHeaders(),
        })
        if (!notifyRes || !notifyRes.ok) throw new Error('failed to load telegram-notify pref')
        const notify = (await notifyRes.json()) as { enabled?: boolean; min_score?: number }
        if (cancelled) return
        setEnabled(notify.enabled ?? false)
        setMinScore(String(notify.min_score ?? 0.02))
      } catch {
        if (!cancelled) setLoadFailed(true)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [cameraId, motionEnabled])

  if (!motionEnabled || !loaded || loadFailed || !telegramActive || !telegramLinked) {
    return null
  }

  async function handleApply() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/cameras/${cameraId}/telegram-notify`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, min_score: parseFloat(minScore) || 0 }),
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Erro ao salvar')
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4 flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wider">
        <TelegramIcon className="h-5 w-5 shrink-0" />
        Notificações via Telegram
      </p>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="motion-telegram-notify-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="accent-primary"
        />
        <label
          htmlFor="motion-telegram-notify-enabled"
          className="text-xs text-muted-foreground cursor-pointer"
        >
          Notificar via Telegram
        </label>
      </div>
      {enabled && (
        <div>
          <label htmlFor="motion-telegram-notify-min-score" className={labelClass}>
            Score mínimo
          </label>
          <input
            id="motion-telegram-notify-min-score"
            type="number"
            step="0.001"
            min="0"
            max="1"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground mt-0.5">
            0 – 1.0 · só notifica eventos com score igual ou acima deste valor
          </p>
        </div>
      )}
      {error && (
        <div className="px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
          {error}
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button
          id="motion-telegram-notify-save"
          type="button"
          size="sm"
          disabled={saving}
          onClick={handleApply}
        >
          {saving ? 'Aplicando...' : 'Aplicar'}
        </Button>
        {saved && <span className="text-xs text-green-400">Salvo</span>}
      </div>
    </div>
  )
}
