import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import MotionNotificationsBell from './MotionNotificationsBell'
import type { Notification } from '../contexts/NotificationContext'

vi.mock('../auth', () => ({
  authHeaders: () => ({ Authorization: 'Bearer test' }),
}))

const markRead = vi.fn()

let notifications: Notification[] = []
let unreadCount = 0

vi.mock('../contexts/NotificationContext', () => ({
  useNotifications: () => ({
    notifications, unreadCount,
    markRead, markSelectedRead: vi.fn(), remove: vi.fn(), removeAll: vi.fn(), removeSelected: vi.fn(),
    browserSupported: false, browserPermission: 'default', browserEnabled: false,
    enableBrowserNotifications: vi.fn(), disableBrowserNotifications: vi.fn(),
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

  it('clique numa notificação resolve recordingId+motionId e navega para /recording/:cameraId/:recordingId/:motionId', async () => {
    notifications = [n]
    const dateStr = format(new Date(n.time), 'yyyy-MM-dd')

    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === `/api/cameras/cam1/motion?date=${dateStr}`) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [{ id: 42, time: n.time, score: n.score }] }) })
      }
      if (url.startsWith('/api/cameras/cam1/recordings?date=')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ recordings: [{ id: 7, start: '2026-07-07T09:00:00Z' }] }) })
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
    }))

    renderBell()
    fireEvent.click(document.getElementById('motion-notifications')!)
    fireEvent.click(document.getElementById(`notification-${n.id}`)!)

    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/recording/cam1/7/42')
    })
    expect(markRead).toHaveBeenCalledWith(n.id)
  })

  it('sem evento casado, navega só com recordingId (sem motionId)', async () => {
    notifications = [n]

    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/motion?date=')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) })
      }
      if (url.includes('/recordings?date=')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ recordings: [{ id: 7, start: '2026-07-07T09:00:00Z' }] }) })
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
    }))

    renderBell()
    fireEvent.click(document.getElementById('motion-notifications')!)
    fireEvent.click(document.getElementById(`notification-${n.id}`)!)

    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/recording/cam1/7')
    })
  })

  it('sem nenhuma gravação no dia, não navega', async () => {
    notifications = [n]

    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/motion?date=')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [{ id: 42, time: n.time, score: n.score }] }) })
      }
      if (url.includes('/recordings?date=')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ recordings: [] }) })
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
    }))

    renderBell()
    fireEvent.click(document.getElementById('motion-notifications')!)
    fireEvent.click(document.getElementById(`notification-${n.id}`)!)

    await waitFor(() => {
      expect(markRead).toHaveBeenCalledWith(n.id)
    })
    expect(document.getElementById('test-location')!.textContent).toBe('/')
  })
})
