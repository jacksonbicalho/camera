import { useCallback, useEffect, useState } from 'react'
import { authHeaders, onUnauthorized } from '../auth'

// usePushSubscription — história feat/web-push-notificacoes-movimento.
// Ao contrário de useBrowserNotifications (Notification disparada direto
// pela página, só funciona com a aba viva — ver NotificationContext.tsx),
// isso é Web Push de verdade: registra o Service Worker (public/sw.js) e
// assina via PushManager, entregando notificações mesmo com o app fechado.
// Exige contexto seguro (HTTPS ou localhost) — `supported` reflete isso
// (false em HTTP puro degrada sem erro, nunca mostra o botão).

// urlBase64ToUint8Array converte a chave pública VAPID (base64url, formato
// do backend/webpush-go) pro Uint8Array que applicationServerKey exige.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Safe)
  const array = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) array[i] = raw.charCodeAt(i)
  return array
}

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  )
}

export interface PushSubscriptionHook {
  supported: boolean
  subscribed: boolean
  loading: boolean
  error: string
  subscribe(): Promise<void>
  unsubscribe(): Promise<void>
}

export function usePushSubscription(): PushSubscriptionHook {
  const supported = isSupported()
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Reflete o estado real na 1ª renderização (ex.: recarregou a página já
  // tendo assinado antes) — sem isso, o botão sempre voltaria pra "Ativar"
  // após um reload, mesmo com a subscription ainda válida no navegador.
  useEffect(() => {
    if (!supported) return
    let cancelled = false
    navigator.serviceWorker
      .getRegistration('/sw.js')
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setSubscribed(!!sub)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [supported])

  const subscribe = useCallback(async () => {
    if (!supported) return
    setLoading(true)
    setError('')
    // Hoisted fora do try — se o POST pro backend falhar (rede, 401, status
    // não-ok), o rollback abaixo desfaz a subscription já criada no
    // PushManager. Sem isso, um reload posterior leria `subscribed=true`
    // só pelo estado do navegador (o efeito de mount usa
    // pushManager.getSubscription(), não o backend) mesmo sem nenhum
    // registro no servidor — notificação nunca chegaria, sem sinal de erro.
    let sub: PushSubscription | null = null
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('Permissão de notificação negada.')
        return
      }

      const keyRes = await fetch('/api/me/push/vapid-public-key', { headers: authHeaders() })
      if (keyRes.status === 401) {
        onUnauthorized()
        return
      }
      if (!keyRes.ok) throw new Error('failed to fetch vapid key')
      const { public_key: publicKey } = await keyRes.json()

      const registration = await navigator.serviceWorker.register('/sw.js')
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const json = sub.toJSON()

      const subRes = await fetch('/api/me/push/subscription', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      })
      if (subRes.status === 401) {
        onUnauthorized()
        await sub.unsubscribe()
        return
      }
      if (!subRes.ok) throw new Error('failed to save subscription')
      setSubscribed(true)
    } catch {
      await sub?.unsubscribe().catch(() => {})
      setError('Não foi possível ativar as notificações — tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [supported])

  const unsubscribe = useCallback(async () => {
    if (!supported) return
    setLoading(true)
    setError('')
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await registration?.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        const res = await fetch('/api/me/push/subscription', {
          method: 'DELETE',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        })
        if (res.status === 401) {
          onUnauthorized()
          return
        }
        if (!res.ok) throw new Error('failed to delete subscription')
      }
      setSubscribed(false)
    } catch {
      setError('Não foi possível desativar as notificações — tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [supported])

  return { supported, subscribed, loading, error, subscribe, unsubscribe }
}
