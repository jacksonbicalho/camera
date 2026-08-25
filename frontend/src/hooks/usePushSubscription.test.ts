import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePushSubscription } from './usePushSubscription'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
}))

// b64url pra "1234" (valor arbitrário só pra passar pelo decode) — o
// conteúdo em si não importa pro teste, só que o fluxo aceita a string
// devolvida pelo backend e usa como applicationServerKey.
const FAKE_VAPID_KEY = 'MTIzNA'

function mockServiceWorker(subscribeImpl: () => Promise<{ endpoint: string; keys: object }>) {
  const unsubscribe = vi.fn(async () => true)
  const registration = {
    pushManager: {
      subscribe: vi.fn(async () => {
        const sub = await subscribeImpl()
        return { endpoint: sub.endpoint, toJSON: () => sub, unsubscribe }
      }),
      getSubscription: vi.fn(async () => null),
    },
  }
  const register = vi.fn(async () => registration)
  const getRegistration = vi.fn(async () => registration)
  vi.stubGlobal('navigator', {
    ...globalThis.navigator,
    serviceWorker: { register, getRegistration },
  })
  vi.stubGlobal('PushManager', class {})
  return { register, registration, unsubscribe }
}

function mockNotificationPermission(result: NotificationPermission) {
  vi.stubGlobal(
    'Notification',
    class {
      static permission = 'default'
      static requestPermission = vi.fn(async () => result)
    },
  )
}

function mockFetch(opts: { subscribeStatus?: number }) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url)
      calls.push({ url: u, init })
      if (u === '/api/me/push/vapid-public-key') {
        return new Response(JSON.stringify({ public_key: FAKE_VAPID_KEY }), { status: 200 })
      }
      if (u === '/api/me/push/subscription') {
        return new Response('{}', { status: opts.subscribeStatus ?? 200 })
      }
      return new Response('{}', { status: 200 })
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CA5: reflete se já existe subscription no mount (sem esperar um clique)', () => {
  it('já tinha subscription (ex.: reload da página) — subscribed=true sem chamar subscribe()', async () => {
    mockNotificationPermission('granted')
    mockFetch({})
    const registration = {
      pushManager: {
        subscribe: vi.fn(),
        getSubscription: vi.fn(async () => ({ endpoint: 'https://push.example/já-assinado' })),
      },
    }
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      serviceWorker: { register: vi.fn(), getRegistration: vi.fn(async () => registration) },
    })
    vi.stubGlobal('PushManager', class {})

    const { result } = renderHook(() => usePushSubscription())
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.subscribed).toBe(true)
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
  })
})

describe('CA5: subscribe() busca a chave pública, assina via PushManager e envia a subscription pro backend', () => {
  it('fluxo feliz: permissão concedida → subscribe → POST com endpoint/keys', async () => {
    mockNotificationPermission('granted')
    const calls = mockFetch({})
    const sub = {
      endpoint: 'https://push.example/ep1',
      keys: { p256dh: 'p-key', auth: 'a-key' },
    }
    mockServiceWorker(async () => sub)

    const { result } = renderHook(() => usePushSubscription())
    expect(result.current.supported).toBe(true)

    await act(async () => {
      await result.current.subscribe()
    })

    const postCall = calls.find((c) => c.url === '/api/me/push/subscription')
    expect(postCall).toBeTruthy()
    const body = JSON.parse(postCall!.init!.body as string)
    expect(body).toEqual({ endpoint: sub.endpoint, keys: sub.keys })
  })

  it('POST pro backend falha: desfaz a subscription já criada no PushManager (rollback) e reporta erro', async () => {
    mockNotificationPermission('granted')
    mockFetch({ subscribeStatus: 500 })
    const sub = { endpoint: 'https://push.example/ep1', keys: { p256dh: 'p', auth: 'a' } }
    const { unsubscribe } = mockServiceWorker(async () => sub)

    const { result } = renderHook(() => usePushSubscription())
    await act(async () => {
      await result.current.subscribe()
    })

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(result.current.subscribed).toBe(false)
    expect(result.current.error).not.toBe('')
  })

  it('permissão negada: não chama subscribe do PushManager nem POST', async () => {
    mockNotificationPermission('denied')
    const calls = mockFetch({})
    const { registration } = mockServiceWorker(async () => ({
      endpoint: 'x',
      keys: { p256dh: 'p', auth: 'a' },
    }))

    const { result } = renderHook(() => usePushSubscription())
    await act(async () => {
      await result.current.subscribe()
    })

    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
    expect(calls.find((c) => c.url === '/api/me/push/subscription')).toBeUndefined()
    expect(result.current.error).not.toBe('')
  })

  it('não suportado (sem PushManager) — supported=false, subscribe() não faz nada', async () => {
    mockNotificationPermission('granted')
    vi.stubGlobal('navigator', { ...globalThis.navigator, serviceWorker: {} })
    // PushManager deliberadamente ausente do window global.

    const { result } = renderHook(() => usePushSubscription())
    expect(result.current.supported).toBe(false)

    await act(async () => {
      await result.current.subscribe()
    })
    expect(result.current.subscribed).toBe(false)
  })
})
