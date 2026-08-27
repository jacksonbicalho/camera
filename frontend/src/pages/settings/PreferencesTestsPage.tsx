import { useEffect, useState } from 'react'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import PreferencesLayout from '../../components/PreferencesLayout'
import TestNotificationCard from '../../components/TestNotificationCard'
import { sendTestNotification } from '../../lib/sendTestNotification'
import { Bell } from '../../components/Icons'
import { TelegramIcon } from '../../components/TelegramIcon'
import { authHeaders, onUnauthorized } from '../../auth'

interface PreferencesTestFlags {
  telegramLinked: boolean
  telegramActive: boolean
  telegramMotionNotifyEnabled: boolean
  pushSubscribed: boolean
}

// PreferencesTestsPage — rota /settings/preferences/tests (história
// feat/preferencias-testes-notificacao): primeira seção "Testes" em
// Preferências, começando com 2 botões de teste de notificação — Telegram e
// Web Push de detecção de movimento. Cada card fica desabilitado (com
// tooltip explicando o motivo, TestNotificationCard) quando o canal
// correspondente não está totalmente configurado, em vez de sumir — mais
// informativo que esconder (mesmo raciocínio de ExtensionCard, mas com
// motivo customizável por card em vez de um texto fixo).
//
// Busca GET /api/me/preferences direto (mesmo padrão ad-hoc já usado por
// TelegramLinkSection/CameraMotionTelegramNotify — não existe um hook
// compartilhado de preferences no projeto ainda) para ler os 4 campos que
// decidem disponibilidade: telegram_linked/telegram_active/
// telegram_motion_notify_enabled (Telegram) e push_subscribed (Web Push).
export default function PreferencesTestsPage() {
  const [flags, setFlags] = useState<PreferencesTestFlags | null>(null)

  useEffect(() => {
    fetch('/api/me/preferences', { headers: authHeaders() })
      .then((res) => {
        if (res.status === 401) {
          onUnauthorized()
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (!data) return
        setFlags({
          telegramLinked: !!data.telegram_linked,
          telegramActive: !!data.telegram_active,
          telegramMotionNotifyEnabled: !!data.telegram_motion_notify_enabled,
          pushSubscribed: !!data.push_subscribed,
        })
      })
      .catch(() => {})
  }, [])

  const telegramAvailable = !!(
    flags?.telegramLinked &&
    flags?.telegramActive &&
    flags?.telegramMotionNotifyEnabled
  )
  const pushAvailable = !!flags?.pushSubscribed

  return (
    <SettingsLayout id="preferences-tests-page" footerId="preferences-tests-footer">
      <PageHeader
        title="Preferências"
        subtitle="Teste os canais de notificação configurados nesta instância."
      />
      <PreferencesLayout active="tests">
        <div className="flex flex-row flex-wrap gap-6">
          <TestNotificationCard
            id="test-telegram-card"
            icon={<TelegramIcon className="relative h-16 w-16" />}
            name="Telegram"
            description="Envia uma notificação de teste para sua conta vinculada."
            available={telegramAvailable}
            disabledReason="Vincule sua conta do Telegram (em Perfil), ative a extensão Telegram e habilite a notificação de movimento em pelo menos uma câmera."
            onTest={() => sendTestNotification('/api/me/telegram/test')}
          />
          <TestNotificationCard
            id="test-push-card"
            icon={
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Bell className="h-8 w-8 text-primary" />
              </div>
            }
            name="Web Push"
            description="Envia uma notificação de teste de detecção de movimento para este navegador."
            available={pushAvailable}
            disabledReason="Ative as notificações push (em Perfil) neste navegador antes de testar."
            onTest={() => sendTestNotification('/api/me/push/test')}
          />
        </div>
      </PreferencesLayout>
    </SettingsLayout>
  )
}
