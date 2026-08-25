import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import MotionNotificationsBell from './MotionNotificationsBell'
import type { Notification } from '../contexts/NotificationContext'

vi.mock('../auth', () => ({
  authHeaders: () => ({ Authorization: 'Bearer test' }),
}))

// RecordingsGateway (usada por useRecordingSegments dentro do RecordingPlayerModal que o
// events-panel passa a abrir) captura globalThis.fetch no construtor e nasce a nível de módulo
// — mesmo padrão de mock usado em RecordingsPage.test.tsx/VideoBrowserPage.test.tsx: mock do
// módulo, não do fetch cru.
const recordingsGatewayMock = vi.hoisted(() => ({
  getTimezone: vi.fn(),
  getRecording: vi.fn(),
  listByDay: vi.fn(),
  getEvent: vi.fn(),
  getPlaybackWindow: vi.fn(),
}))
vi.mock('../lib/recordingsGateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/recordingsGateway')>()
  return {
    ...actual,
    RecordingsGateway: class {
      getTimezone = recordingsGatewayMock.getTimezone
      getRecording = recordingsGatewayMock.getRecording
      listByDay = recordingsGatewayMock.listByDay
      getEvent = recordingsGatewayMock.getEvent
      getPlaybackWindow = recordingsGatewayMock.getPlaybackWindow
      playbackURL = (r: { url: string }) => `${r.url}?token=fake`
    },
  }
})

const markRead = vi.fn()

let notifications: Notification[] = []
let unreadCount = 0

vi.mock('../contexts/NotificationContext', () => ({
  useNotifications: () => ({
    notifications,
    unreadCount,
    markRead,
    markSelectedRead: vi.fn(),
    remove: vi.fn(),
    removeAll: vi.fn(),
    removeSelected: vi.fn(),
    browserSupported: false,
    browserPermission: 'default',
    browserEnabled: false,
    enableBrowserNotifications: vi.fn(),
    disableBrowserNotifications: vi.fn(),
  }),
}))

function LocationProbe() {
  const location = useLocation()
  return <div id="test-location">{location.pathname}</div>
}

function renderBell(showLabel = true) {
  return render(
    <MemoryRouter>
      <MotionNotificationsBell showLabel={showLabel} />
      <LocationProbe />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  notifications = []
  unreadCount = 0
  recordingsGatewayMock.getTimezone.mockResolvedValue('UTC')
  recordingsGatewayMock.getRecording.mockResolvedValue({ filename: 'c.mp4', date: '2026-07-07' })
  recordingsGatewayMock.listByDay.mockResolvedValue([])
  recordingsGatewayMock.getEvent.mockResolvedValue(null)
  recordingsGatewayMock.getPlaybackWindow.mockResolvedValue({ lead: 5, trail: 10 })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  markRead.mockClear()
})

const n: Notification = {
  id: 'cam1-2026-07-07T10:00:00Z',
  type: 'motion',
  cameraId: 'cam1',
  cameraName: 'Corredor',
  time: '2026-07-07T10:00:00Z',
  score: 0.8,
  read: false,
}

describe('MotionNotificationsBell', () => {
  it('renderiza com id motion-notifications', () => {
    renderBell()
    expect(document.getElementById('motion-notifications')).toBeTruthy()
  })

  it('mostra badge de não lidas quando unreadCount > 0', () => {
    unreadCount = 3
    renderBell()
    expect(document.getElementById('motion-notifications')!.textContent).toContain('3')
  })

  it('sem não lidas, não mostra badge', () => {
    renderBell()
    expect(document.getElementById('motion-notifications')!.querySelector('.bg-primary')).toBeNull()
  })

  it('clique abre o painel e lista as notificações', () => {
    notifications = [n]
    renderBell()
    fireEvent.click(document.getElementById('motion-notifications')!)
    expect(document.body.textContent).toContain('Corredor')
  })

  describe('CA2: clique num item abre o recording-player-modal (sem navegar)', () => {
    it('clique numa notificação resolve recordingId+motionId e abre o recording-player-modal, sem navegar', async () => {
      notifications = [n]
      const dateStr = format(new Date(n.time), 'yyyy-MM-dd')

      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url === `/api/cameras/cam1/motion?date=${dateStr}`) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ events: [{ id: 42, time: n.time, score: n.score }] }),
            })
          }
          if (url.startsWith('/api/cameras/cam1/recordings?date=')) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({ recordings: [{ id: 7, start: '2026-07-07T09:00:00Z' }] }),
            })
          }
          return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
        }),
      )

      renderBell()
      fireEvent.click(document.getElementById('motion-notifications')!)
      fireEvent.click(document.getElementById(`notification-${n.id}`)!)

      await waitFor(() => {
        expect(document.getElementById('recording-player-modal')).not.toBeNull()
      })
      expect(document.getElementById('test-location')!.textContent).toBe('/')
      expect(markRead).toHaveBeenCalledWith(n.id)
      // O painel de eventos fecha ao abrir o modal (mesmo comportamento de antes: setOpen(false)).
      expect(document.getElementById('events-panel')).toBeNull()
    })

    it('sem evento casado, abre o modal só com recordingId (sem motionId)', async () => {
      notifications = [n]

      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.includes('/motion?date=')) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) })
          }
          if (url.includes('/recordings?date=')) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({ recordings: [{ id: 7, start: '2026-07-07T09:00:00Z' }] }),
            })
          }
          return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
        }),
      )

      renderBell()
      fireEvent.click(document.getElementById('motion-notifications')!)
      fireEvent.click(document.getElementById(`notification-${n.id}`)!)

      await waitFor(() => {
        expect(document.getElementById('recording-player-modal')).not.toBeNull()
      })
      expect(document.getElementById('test-location')!.textContent).toBe('/')
    })

    it('sem nenhuma gravação no dia, não abre o modal', async () => {
      notifications = [n]

      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.includes('/motion?date=')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ events: [{ id: 42, time: n.time, score: n.score }] }),
            })
          }
          if (url.includes('/recordings?date=')) {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ recordings: [] }) })
          }
          return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
        }),
      )

      renderBell()
      fireEvent.click(document.getElementById('motion-notifications')!)
      fireEvent.click(document.getElementById(`notification-${n.id}`)!)

      await waitFor(() => {
        expect(markRead).toHaveBeenCalledWith(n.id)
      })
      expect(document.getElementById('recording-player-modal')).toBeNull()
      expect(document.getElementById('test-location')!.textContent).toBe('/')
    })
  })

  describe('CA2 (lighthouse-hardening): aria-label do sino inclui a contagem de não lidas', () => {
    it('unreadCount=3 → aria-label menciona "3"', () => {
      unreadCount = 3
      renderBell()
      const btn = document.getElementById('motion-notifications')!
      expect(btn.getAttribute('aria-label')).toContain('3')
    })

    it('unreadCount=0 → aria-label continua só "Eventos" (sem número)', () => {
      renderBell()
      const btn = document.getElementById('motion-notifications')!
      expect(btn.getAttribute('aria-label')).toBe('Eventos')
    })
  })

  it('selecionar tudo e excluir mostra o ConfirmDialog acima do painel de eventos (z-index)', () => {
    notifications = [n]
    renderBell()
    fireEvent.click(document.getElementById('motion-notifications')!)
    fireEvent.click(document.getElementById('events-select-all')!)
    fireEvent.click(document.getElementById('events-action-delete')!)

    const dialogConfirm = document.getElementById('confirm-dialog-confirm')
    expect(dialogConfirm).toBeTruthy()

    const overlay = dialogConfirm!.closest('.fixed.inset-0')
    expect(overlay).toBeTruthy()
    expect(overlay!.className).toContain('z-10000')

    // Precisa ser portalado direto em document.body — senão fica preso no
    // stacking context de qualquer ancestral (ex.: o wrapper `sticky z-10` da
    // Sidebar em produção), e o z-index alto não adianta nada nesse caso.
    expect(overlay!.parentElement).toBe(document.body)

    // O painel do flyout continua montado (zIndex 9999) — o diálogo precisa
    // desenhar por cima dele, não atrás.
    expect(document.getElementById('events-panel')).toBeTruthy()
  })
})
