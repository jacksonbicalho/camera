import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { UserNotificationProvider, useUserNotifications } from './UserNotificationContext'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'tok',
  onUnauthorized: vi.fn(),
}))

class FakeEventSource {
  static instances: FakeEventSource[] = []
  onmessage: ((e: { data: string }) => void) | null = null
  url: string
  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  close() {}
}

let unread = 0

function Probe() {
  const { unreadCount } = useUserNotifications()
  return <div data-testid="unread">{unreadCount}</div>
}

beforeEach(() => {
  unread = 0
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        status: 200,
        json: () => Promise.resolve({ notifications: [], unread_count: unread }),
      }),
    ),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('UserNotificationContext — push por SSE', () => {
  it('abre EventSource em /api/notifications/live e recarrega ao receber evento', async () => {
    render(
      <UserNotificationProvider>
        <Probe />
      </UserNotificationProvider>,
    )

    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
    expect(FakeEventSource.instances[0].url).toContain('/api/notifications/live')
    await waitFor(() => expect(screen.getByTestId('unread').textContent).toBe('0'))

    // servidor empurra → o contexto recarrega e pega o novo unread_count
    unread = 3
    act(() => {
      FakeEventSource.instances[0].onmessage?.({ data: '{"type":"notification"}' })
    })
    await waitFor(() => expect(screen.getByTestId('unread').textContent).toBe('3'))
  })
})
