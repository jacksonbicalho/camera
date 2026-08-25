/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { getToken } from '../auth'
import { useBrowserNotifications } from '../hooks/useBrowserNotifications'

const STORAGE_KEY = 'camera_notifications'
const MAX_NOTIFICATIONS = 100

export interface Notification {
  id: string
  type: 'motion'
  cameraId: string
  cameraName?: string
  time: string
  score: number
  label?: string
  color?: string
  read: boolean
}

interface NotificationContextValue {
  notifications: Notification[]
  unreadCount: number
  markRead(id: string): void
  markReadByEvent(cameraId: string, time: string): void
  markAllRead(): void
  markSelectedRead(ids: string[]): void
  markAllUnread(ids: string[]): void
  remove(id: string): void
  removeAll(): void
  removeSelected(ids: string[]): void
  browserSupported: boolean
  browserPermission: NotificationPermission | 'unavailable'
  browserEnabled: boolean
  enableBrowserNotifications(): Promise<void>
  disableBrowserNotifications(): void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

function load(): Notification[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function save(notifications: Notification[]) {
  if (notifications.length === 0) {
    localStorage.removeItem(STORAGE_KEY)
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
  }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>(load)
  const {
    supported: browserSupported,
    permission: browserPermission,
    enabled: browserEnabled,
    requestAndEnable: enableBrowserNotifications,
    disable: disableBrowserNotifications,
    closeBrowserNotification,
    closeAllBrowserNotifications,
  } = useBrowserNotifications()

  const closeBrowserRef = useRef(closeBrowserNotification)
  useEffect(() => {
    closeBrowserRef.current = closeBrowserNotification
  }, [closeBrowserNotification])
  const closeAllBrowserRef = useRef(closeAllBrowserNotifications)
  useEffect(() => {
    closeAllBrowserRef.current = closeAllBrowserNotifications
  }, [closeAllBrowserNotifications])

  function update(next: Notification[]) {
    setNotifications(next)
    save(next)
  }

  // markRead — useCallback com deps vazias (updater FUNCIONAL de setNotifications, nunca lê
  // `notifications` do closure) por dois motivos: (1) identidade ESTÁVEL entre renders — T4
  // (história fix/liveview-mobile-player-notificacoes) passou a chamar `markReadByEvent`
  // (abaixo) de dentro de `useEffect`s em componentes consumidores, com ela própria na
  // dependency array; sem identidade estável, cada render do Provider recriaria a função,
  // disparando esses efeitos de novo — e cada disparo, se causasse uma mudança de estado,
  // causaria outro render do Provider, num loop (achado real do code review, confirmado com
  // um repro que travava em ~30s). (2) BAIL-OUT: quando o id não existe ou já está lido,
  // devolve a MESMA referência `prev` — React pula o re-render inteiro nesse caso (nenhuma
  // mudança de estado real), o que é o que efetivamente quebra o loop (mesmo que a função já
  // fosse estável, um `useEffect` chamando `markReadByEvent` para um evento JÁ lido não pode
  // ficar re-renderizando o Provider a cada disparo).
  const markRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const idx = prev.findIndex((n) => n.id === id)
      if (idx === -1 || prev[idx].read) return prev
      closeBrowserRef.current(prev[idx].cameraId)
      const next = [...prev]
      next[idx] = { ...next[idx], read: true }
      save(next)
      return next
    })
  }, [])

  // markReadByEvent — marca como lida a notificação da câmera+instante indicados, usada por
  // qualquer ponto do sistema que iniciar a reprodução do evento correspondente (não só o
  // clique dentro do próprio sino, que já chamava `markRead` diretamente): RecordingPlayerModal
  // (cobre sino/Momentos/RecordingsPage), VideoBrowserPage (deep-link /recording/:cameraId/
  // :recordingId/:motionId) e HistoryPage (abertura com :motionId). No-op silencioso se não
  // houver notificação com esse id (`${cameraId}-${time}`, mesmo formato usado ao criar a
  // notificação a partir do SSE) — reproduzir um evento sem notificação correspondente (ex.
  // evento antigo, notificação já removida) não é erro. Mesma identidade estável de `markRead`
  // (deps só `[markRead]`, que por sua vez nunca muda) — necessário pelo mesmo motivo (ver
  // comentário de `markRead`).
  const markReadByEvent = useCallback(
    (cameraId: string, time: string) => markRead(`${cameraId}-${time}`),
    [markRead],
  )

  // Single SSE connection that receives events from all accessible cameras.
  // Re-opens on auth changes so notifications work immediately after login.
  useEffect(() => {
    let es: EventSource | null = null

    function connect() {
      if (es) {
        es.close()
        es = null
      }
      const token = getToken()
      if (!token) return
      const url = `/api/motion/live?token=${encodeURIComponent(token)}`
      es = new EventSource(url)
      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data)
          const id: string = payload.camera_id ?? 'unknown'
          const time: string = payload.time ?? new Date().toISOString()
          const score: number = payload.score ?? 0
          const label: string | undefined = payload.label || undefined
          const color: string | undefined = payload.color || undefined
          const notification: Notification = {
            id: `${id}-${time}`,
            type: 'motion',
            cameraId: id,
            cameraName: payload.camera_name || undefined,
            time,
            score,
            label,
            color,
            read: false,
          }
          setNotifications((current) => {
            const next = [notification, ...current].slice(0, MAX_NOTIFICATIONS)
            save(next)
            return next
          })
          // Não dispara mais useBrowserNotifications().notify() aqui (história
          // feat/web-push-notificacoes-movimento) — quem tiver Web Push ativo
          // (PushSubscriptionSection, /profile) já recebe a notificação do SO
          // via Service Worker (sw.js), que dispara mesmo com a aba em
          // primeiro plano; disparar os dois duplicaria a notificação pra
          // quem tem as duas coisas ativas. A SSE aqui só alimenta a lista/
          // contagem do sino — não é mais a fonte do popup do SO.
          //
          // O toggle "notificações do navegador" (MotionNotificationsBell,
          // useBrowserNotifications) continua existindo na UI mas fica sem
          // efeito — era o único chamador de `notify`. Removê-lo por
          // completo (toggle + hook) é limpeza fora do escopo desta
          // história; registrado como follow-up.
        } catch {
          // ignore malformed events
        }
      }
    }

    connect()
    window.addEventListener('camera:token-changed', connect)
    return () => {
      window.removeEventListener('camera:token-changed', connect)
      if (es) es.close()
    }
  }, [])

  function markAllRead() {
    closeAllBrowserRef.current()
    update(notifications.map((n) => ({ ...n, read: true })))
  }

  function markSelectedRead(ids: string[]) {
    const idSet = new Set(ids)
    notifications
      .filter((n) => idSet.has(n.id) && !n.read)
      .forEach((n) => closeBrowserRef.current(n.cameraId))
    update(notifications.map((n) => (idSet.has(n.id) ? { ...n, read: true } : n)))
  }

  function markAllUnread(ids: string[]) {
    const idSet = new Set(ids)
    update(notifications.map((n) => (idSet.has(n.id) ? { ...n, read: false } : n)))
  }

  function remove(id: string) {
    const n = notifications.find((n) => n.id === id)
    if (n) closeBrowserRef.current(n.cameraId)
    update(notifications.filter((n) => n.id !== id))
  }

  function removeAll() {
    closeAllBrowserRef.current()
    update([])
  }

  function removeSelected(ids: string[]) {
    const idSet = new Set(ids)
    notifications.filter((n) => idSet.has(n.id)).forEach((n) => closeBrowserRef.current(n.cameraId))
    update(notifications.filter((n) => !idSet.has(n.id)))
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markRead,
        markReadByEvent,
        markAllRead,
        markSelectedRead,
        markAllUnread,
        remove,
        removeAll,
        removeSelected,
        browserSupported,
        browserPermission,
        browserEnabled,
        enableBrowserNotifications,
        disableBrowserNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider')
  return ctx
}
