/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { authHeaders, getToken, onUnauthorized } from '../auth'
import { useEventSource } from '../hooks/useEventSource'

export type UserNotificationType = 'success' | 'error' | 'warning' | 'info'

export interface UserNotification {
  id: number
  type: UserNotificationType
  title?: string
  message: string
  link?: string
  created_at: string
  read: boolean
}

interface UserNotificationContextValue {
  notifications: UserNotification[]
  unreadCount: number
  reload: () => void
  markRead: (id: number) => void
  markAllRead: () => void
  remove: (id: number) => void
  removeAll: () => void
}

const Ctx = createContext<UserNotificationContextValue | null>(null)
// O servidor empurra via SSE (/api/notifications/live). O poll é só rede de
// segurança (longo) para eventos perdidos numa reconexão do EventSource.
const POLL_MS = 300000

export function UserNotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<UserNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [hasToken, setHasToken] = useState(() => !!getToken())

  // reload only mutates state asynchronously (inside the fetch .then) so it is
  // safe to call from an effect without cascading synchronous renders.
  const reload = useCallback(() => {
    if (!getToken()) return
    fetch('/api/notifications', { headers: authHeaders() })
      .then(res => {
        if (res.status === 401) { onUnauthorized(); return null }
        return res.json()
      })
      .then(data => {
        if (data) {
          setNotifications(data.notifications ?? [])
          setUnreadCount(data.unread_count ?? 0)
        }
      })
      .catch(() => {})
  }, [])

  // Push: assina o SSE por usuário e recarrega ao receber um evento. O path é
  // gated pelo token — vira null no logout (fecha a conexão) e volta ao logar
  // (reabre com o token novo). `reload` é estável, então não reabre à toa.
  useEventSource(hasToken ? '/api/notifications/live' : null, reload)

  useEffect(() => {
    reload()
    const t = setInterval(reload, POLL_MS)
    const onToken = () => {
      setHasToken(!!getToken())
      if (getToken()) {
        reload()
      } else {
        // logged out: clear so a new login doesn't briefly show the previous user's badge
        setNotifications([])
        setUnreadCount(0)
      }
    }
    window.addEventListener('camera:token-changed', onToken)
    return () => {
      clearInterval(t)
      window.removeEventListener('camera:token-changed', onToken)
    }
  }, [reload])

  const mutate = useCallback(
    (url: string, method: string) =>
      fetch(url, { method, headers: authHeaders() }).then(() => reload()).catch(() => {}),
    [reload]
  )

  const markRead = useCallback((id: number) => mutate(`/api/notifications/${id}/read`, 'POST'), [mutate])
  const markAllRead = useCallback(() => mutate('/api/notifications/read-all', 'POST'), [mutate])
  const remove = useCallback((id: number) => mutate(`/api/notifications/${id}`, 'DELETE'), [mutate])
  const removeAll = useCallback(() => mutate('/api/notifications', 'DELETE'), [mutate])

  return (
    <Ctx.Provider value={{ notifications, unreadCount, reload, markRead, markAllRead, remove, removeAll }}>
      {children}
    </Ctx.Provider>
  )
}

export function useUserNotifications(): UserNotificationContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useUserNotifications must be used inside UserNotificationProvider')
  return ctx
}
