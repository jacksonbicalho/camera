import { useEffect, useState } from 'react'
import { ApplyButton } from '@/components/ui/apply-button'
import { Check } from '@/components/Icons'
import { TelegramIcon } from '@/components/TelegramIcon'
import ExtensionCard from '@/components/ExtensionCard'
import ExtensionActiveToggle from '@/components/ExtensionActiveToggle'
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
//
// Redesenho (história feat/telegram-link-card-dados-chat-live-update, T5) —
// mesmo estilo de ExtensionCard/ExtensionActiveToggle já usado em
// TelegramExtensionCard/S3ExtensionCard/TelegramLinkSection: card próprio
// (aninhado dentro do painel "Detecção de movimento" — decisão deliberada
// do navigator, confirmada mesmo sabendo do card-dentro-de-card) e o
// checkbox nativo virou um toggle switch com label padrão "Ativado".
// `savedEnabled`/`savedMinScore` guardam o último valor CONFIRMADO (do
// fetch inicial, ou reatribuído após um PUT bem-sucedido) — alimentam o
// selo do toggle E a regra de habilitação do "Aplicar" (só habilita quando
// o staged diverge do salvo em pelo menos um dos dois campos), pedido do
// navigator testando a página real — mesmo espírito da CA5 de
// TelegramExtensionCard (história fix/ajustes-icone-telegram-e-momentos),
// agora estendido a 2 campos em vez de 1.

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
  const [savedEnabled, setSavedEnabled] = useState(false)
  const [minScore, setMinScore] = useState('0.02')
  const [savedMinScore, setSavedMinScore] = useState('0.02')
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
        setSavedEnabled(notify.enabled ?? false)
        setMinScore(String(notify.min_score ?? 0.02))
        setSavedMinScore(String(notify.min_score ?? 0.02))
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

  // parseFloat na comparação de minScore — evita falso-divergente por
  // formatação (ex.: "0.020" digitado vs. "0.02" salvo), o mesmo valor
  // numérico não deveria manter o botão habilitado à toa.
  const hasChanges = enabled !== savedEnabled || parseFloat(minScore) !== parseFloat(savedMinScore)

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
      setSavedEnabled(enabled)
      setSavedMinScore(minScore)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-6 border-t border-border pt-6">
      <ExtensionCard
        id="motion-telegram-notify"
        icon={<TelegramIcon className="relative h-16 w-16" />}
        name="Notificações via Telegram"
        description="Receba um aviso no Telegram quando esta câmera detectar movimento."
        available
      >
        <ExtensionActiveToggle
          id="motion-telegram-notify-enabled"
          checked={enabled}
          onChange={setEnabled}
          savedActive={savedEnabled}
          description="Notificar via Telegram"
        />
        {enabled && (
          <div className="mb-4">
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
          <div className="px-3 py-2 mb-4 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
            {error}
          </div>
        )}
        <div className="flex items-center gap-3">
          <ApplyButton
            id="motion-telegram-notify-save"
            saving={saving}
            disabled={!hasChanges}
            type="button"
            onClick={handleApply}
            icon={<Check className="h-4 w-4" />}
          />
          {saved && <span className="text-xs text-green-400">Salvo</span>}
        </div>
      </ExtensionCard>
    </div>
  )
}
