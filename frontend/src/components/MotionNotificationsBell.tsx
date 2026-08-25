import { useState } from 'react'
import { createPortal } from 'react-dom'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useNotifications, type Notification } from '../contexts/NotificationContext'
import { navItemClass, useFlyout } from './sidebarFlyout'
import { resolveEventRecordingUrl } from '../lib/eventNavigation'
import ConfirmDialog from './ConfirmDialog'
import EventsPanelHeader from './EventsPanelHeader'
import RecordingPlayerModal from './RecordingPlayerModal'
import { Bell, X } from './Icons'
import { Button } from './ui/button'

// Casa a URL /recording/:cameraId/:recordingId(/:motionId) resolvida por
// resolveEventRecordingUrl — extrai os ids em vez de navegar, pro modal abrir com eles (mesmo
// padrão de RecordingsPage.tsx: RECORDING_URL_RE local, não extraída — só 2 ocorrências hoje,
// abaixo do limiar que justificaria uma abstração compartilhada).
const RECORDING_URL_RE = /^\/recording\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/

interface ModalTarget {
  cameraId: string
  recordingId: string
  motionId?: string
}

interface ConfirmState {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  action: () => void
}

function NotificationItem({
  n,
  checked,
  onToggle,
  onClick,
  onRemove,
}: {
  n: Notification
  checked: boolean
  onToggle: () => void
  onClick: () => void
  onRemove: () => void
}) {
  const relTime = formatDistanceToNow(new Date(n.time), {
    addSuffix: true,
    locale: ptBR,
  })

  return (
    <div
      className={`flex items-start gap-2 px-3 py-2 hover:bg-accent transition-colors ${
        !n.read ? 'border-l-2 border-primary' : 'border-l-2 border-transparent'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5 w-3 h-3 flex-shrink-0 accent-primary cursor-pointer"
      />
      <div id={`notification-${n.id}`} className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
        <div className="text-xs text-foreground font-medium truncate">
          {n.cameraName || n.cameraId}
        </div>
        <div className="text-xs text-muted-foreground">
          {n.label && <span style={{ color: n.color ?? '#f97316' }}>{n.label} · </span>}
          {(n.score * 100).toFixed(1)}% · {relTime}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="h-6 w-6 shrink-0 mt-0.5 text-muted-foreground [&_svg]:size-3.5"
        title="Excluir"
      >
        <X />
      </Button>
    </div>
  )
}

// MotionNotificationsBell — sino "Eventos" do sidebar novo: botão com badge de não
// lidas + painel (portal, id="events-panel") com a lista de notificações de
// movimento, seleção múltipla, marcar-lidas/excluir e o toggle de notificações do
// navegador. Extraído do sidebar legado (AppSidebar.tsx, id antigo
// "sidebar-notifications") — mesma funcionalidade, id renomeado pra
// "motion-notifications". Clicar numa notificação abre o player em modal
// (RecordingPlayerModal) — não navega mais pra /recording/:cameraId/:recordingId
// (/:motionId), mesma troca que RecordingsPage.tsx já fez pro clique num "momento";
// a rota continua existindo intacta pra outros pontos de entrada (deep-link,
// notificação nativa do browser via NotificationContext).
//
// Como a notificação (SSE de /api/motion/live) só carrega camera_id/time/score —
// nem o id numérico do evento (motion_events.id) nem uma gravação — o clique
// RESOLVE os dois no momento: busca os eventos do dia (GET .../motion?date=) pra
// achar o evento com o mesmo `time` (dá o :motionId) e as gravações do dia (GET
// .../recordings?date=) pra escolher a gravação-âncora (dá o :recordingId).
export default function MotionNotificationsBell({ showLabel }: { showLabel: boolean }) {
  const { open, setOpen, pos, btnRef, panelRef, toggle } = useFlyout<HTMLButtonElement>()
  const {
    notifications,
    unreadCount,
    markRead,
    markSelectedRead,
    remove,
    removeAll,
    removeSelected,
    browserSupported,
    browserPermission,
    browserEnabled,
    enableBrowserNotifications,
    disableBrowserNotifications,
  } = useNotifications()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [modalTarget, setModalTarget] = useState<ModalTarget | null>(null)

  const allSelected = notifications.length > 0 && notifications.every((n) => selectedIds.has(n.id))
  const someSelected = selectedIds.size > 0

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(notifications.map((n) => n.id)))
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function targetIds() {
    return [...selectedIds]
  }
  function targetLabel() {
    return `${selectedIds.size} notificação(ões) selecionada(s)`
  }

  const selectedNotifications = notifications.filter((n) => selectedIds.has(n.id))
  const canMarkRead = selectedNotifications.some((n) => !n.read)

  function ask(state: ConfirmState) {
    setConfirm(state)
  }

  function handleConfirm() {
    confirm?.action()
    setConfirm(null)
  }

  async function goToEvent(n: Notification) {
    markRead(n.id)
    setOpen(false)
    const url = await resolveEventRecordingUrl(n.cameraId, n.time)
    if (!url) return
    const m = url.match(RECORDING_URL_RE)
    if (!m) return
    setModalTarget({ cameraId: m[1], recordingId: m[2], motionId: m[3] })
  }

  return (
    <>
      <button
        id="motion-notifications"
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="Eventos"
        aria-label={unreadCount > 0 ? `Eventos, ${unreadCount} não lidas` : 'Eventos'}
        className={navItemClass(open, showLabel)}
      >
        <span className="relative inline-flex shrink-0">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-on-primary">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        {showLabel && <span className="truncate text-sm">Eventos</span>}
      </button>

      {open &&
        createPortal(
          <div
            id="events-panel"
            ref={panelRef}
            style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
            className="w-72 bg-surface border border-border rounded shadow-lg flex flex-col max-h-[80vh]"
          >
            <EventsPanelHeader
              allSelected={allSelected}
              someSelected={someSelected}
              canMarkRead={canMarkRead}
              onToggleAll={toggleAll}
              onMarkRead={() =>
                ask({
                  title: 'Marcar como lidas',
                  message: `Marcar ${targetLabel()} como lidas?`,
                  confirmLabel: 'Marcar',
                  action: () => {
                    markSelectedRead(targetIds())
                    setSelectedIds(new Set())
                  },
                })
              }
              onDelete={() =>
                ask({
                  title: 'Excluir notificações',
                  message: `Excluir ${targetLabel()}? Esta ação não pode ser desfeita.`,
                  confirmLabel: 'Excluir',
                  danger: true,
                  action: () => {
                    if (someSelected) {
                      removeSelected(targetIds())
                    } else {
                      removeAll()
                    }
                    setSelectedIds(new Set())
                  },
                })
              }
            />

            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <p className="text-xs text-faint text-center py-6">Nenhuma notificação</p>
              ) : (
                notifications.map((n) => (
                  <NotificationItem
                    key={n.id}
                    n={n}
                    checked={selectedIds.has(n.id)}
                    onToggle={() => toggleOne(n.id)}
                    onClick={() => goToEvent(n)}
                    onRemove={() =>
                      ask({
                        title: 'Excluir notificação',
                        message: 'Excluir esta notificação?',
                        confirmLabel: 'Excluir',
                        danger: true,
                        action: () => {
                          remove(n.id)
                          setSelectedIds((prev) => {
                            const next = new Set(prev)
                            next.delete(n.id)
                            return next
                          })
                        },
                      })
                    }
                  />
                ))
              )}
            </div>

            {browserSupported && (
              <div className="border-t border-border px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Alertas do sistema</span>
                {browserPermission === 'denied' ? (
                  <Button
                    variant="link"
                    onClick={enableBrowserNotifications}
                    className="h-auto p-0 text-xs text-red-400 hover:text-red-300"
                    title="Permissão negada — tentar"
                  >
                    Permissão negada
                  </Button>
                ) : browserEnabled ? (
                  <Button
                    variant="link"
                    onClick={disableBrowserNotifications}
                    className="h-auto p-0 text-xs text-primary hover:text-primary/80"
                  >
                    Desativar
                  </Button>
                ) : (
                  <Button
                    variant="link"
                    onClick={enableBrowserNotifications}
                    className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Ativar
                  </Button>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />

      <RecordingPlayerModal
        open={modalTarget != null}
        cameraId={modalTarget?.cameraId ?? null}
        recordingId={modalTarget?.recordingId ?? null}
        motionId={modalTarget?.motionId}
        onClose={() => setModalTarget(null)}
      />
    </>
  )
}
