import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { NotificationProvider, useNotifications } from './NotificationContext'

const STORAGE_KEY = 'camera_notifications'

// Minimal EventSource mock
class FakeEventSource {
  static instances: FakeEventSource[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  url: string
  closed = false

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  emit(data: string) {
    this.onmessage?.({ data } as MessageEvent)
  }

  close() {
    this.closed = true
  }
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <NotificationProvider>{children}</NotificationProvider>
  </MemoryRouter>
)

// Aguarda efeitos assíncronos
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })

beforeEach(() => {
  cleanup()
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  localStorage.clear()
  localStorage.setItem('camera_token', 'fake-token')
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('NotificationContext — estado inicial', () => {
  it('começa sem notificações', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper })
    expect(result.current.notifications).toEqual([])
    expect(result.current.unreadCount).toBe(0)
  })

  it('restaura notificações salvas no localStorage', () => {
    const saved = [
      {
        id: 'cam1-1000',
        type: 'motion',
        cameraId: 'cam1',
        time: '2026-01-01T00:00:00Z',
        score: 0.5,
        read: false,
      },
    ]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))

    const { result } = renderHook(() => useNotifications(), { wrapper })
    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.unreadCount).toBe(1)
  })
})

describe('NotificationContext — recebimento de eventos SSE', () => {
  it('cria notificação ao receber evento de movimento', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper })

    await flush()

    const es = FakeEventSource.instances.find((e) => e.url.includes('/api/motion/live'))
    expect(es).toBeDefined()

    act(() => {
      es!.emit(JSON.stringify({ camera_id: 'cam1', score: 0.42, time: '2026-01-01T12:00:00Z' }))
    })

    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.notifications[0].cameraId).toBe('cam1')
    expect(result.current.notifications[0].score).toBe(0.42)
    expect(result.current.notifications[0].read).toBe(false)
    expect(result.current.unreadCount).toBe(1)
  })

  it('persiste notificação no localStorage ao receber evento', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper })

    await flush()

    const es = FakeEventSource.instances.find((e) => e.url.includes('/api/motion/live'))!

    act(() => {
      es.emit(JSON.stringify({ camera_id: 'cam1', score: 0.3, time: '2026-01-01T12:00:00Z' }))
    })

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    expect(stored).toHaveLength(1)
    expect(result.current.notifications).toHaveLength(1)
  })

  it('mantém máximo de 100 notificações descartando as mais antigas', async () => {
    const existing = Array.from({ length: 100 }, (_, i) => ({
      id: `cam1-${i}`,
      type: 'motion',
      cameraId: 'cam1',
      time: `2026-01-01T00:00:0${String(i).padStart(2, '0')}Z`,
      score: 0.1,
      read: true,
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))

    const { result } = renderHook(() => useNotifications(), { wrapper })

    await flush()

    const es = FakeEventSource.instances.find((e) => e.url.includes('/api/motion/live'))!

    act(() => {
      es.emit(JSON.stringify({ camera_id: 'cam1', score: 0.9, time: '2026-01-02T00:00:00Z' }))
    })

    expect(result.current.notifications).toHaveLength(100)
    // O mais recente deve estar no topo
    expect(result.current.notifications[0].score).toBe(0.9)
  })
})

// setupWithNotification — hoisted (usada também por "markReadByEvent", abaixo): renderiza o
// provider, aguarda a conexão SSE e emite 1 notificação de movimento (cam1, 2026-01-01T12:00:00Z
// → id "cam1-2026-01-01T12:00:00Z"), não lida.
async function setupWithNotification() {
  const { result } = renderHook(() => useNotifications(), { wrapper })
  await flush()

  const es = FakeEventSource.instances.find((e) => e.url.includes('/api/motion/live'))!
  act(() => {
    es.emit(JSON.stringify({ camera_id: 'cam1', score: 0.5, time: '2026-01-01T12:00:00Z' }))
  })
  return result
}

describe('NotificationContext — operações', () => {
  it('markRead marca uma notificação como lida', async () => {
    const result = await setupWithNotification()
    const id = result.current.notifications[0].id

    act(() => {
      result.current.markRead(id)
    })

    expect(result.current.notifications[0].read).toBe(true)
    expect(result.current.unreadCount).toBe(0)
  })

  it('markAllRead marca todas as notificações como lidas', async () => {
    const result = await setupWithNotification()

    act(() => {
      result.current.markAllRead()
    })

    expect(result.current.notifications.every((n) => n.read)).toBe(true)
    expect(result.current.unreadCount).toBe(0)
  })

  it('remove exclui uma notificação por id', async () => {
    const result = await setupWithNotification()
    const id = result.current.notifications[0].id

    act(() => {
      result.current.remove(id)
    })

    expect(result.current.notifications).toHaveLength(0)
  })

  it('markAllUnread marca notificações selecionadas como não lidas', async () => {
    const result = await setupWithNotification()
    const id = result.current.notifications[0].id

    act(() => {
      result.current.markRead(id)
    })
    expect(result.current.notifications[0].read).toBe(true)

    act(() => {
      result.current.markAllUnread([id])
    })
    expect(result.current.notifications[0].read).toBe(false)
    expect(result.current.unreadCount).toBe(1)
  })

  it('removeAll limpa todas as notificações', async () => {
    const result = await setupWithNotification()

    act(() => {
      result.current.removeAll()
    })

    expect(result.current.notifications).toHaveLength(0)
    expect(result.current.unreadCount).toBe(0)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('NotificationContext — sem token', () => {
  it('não abre EventSource quando não há token', async () => {
    localStorage.removeItem('camera_token')

    renderHook(() => useNotifications(), { wrapper })

    await flush()

    expect(FakeEventSource.instances).toHaveLength(0)
  })

  it('abre EventSource após login (camera:token-changed)', async () => {
    localStorage.removeItem('camera_token')

    renderHook(() => useNotifications(), { wrapper })
    await flush()
    expect(FakeEventSource.instances).toHaveLength(0)

    // Simula login: salva token e dispara evento
    act(() => {
      localStorage.setItem('camera_token', 'new-token')
      window.dispatchEvent(new Event('camera:token-changed'))
    })
    await flush()

    expect(FakeEventSource.instances).toHaveLength(1)
    expect(FakeEventSource.instances[0].url).toContain('/api/motion/live')
  })

  it('fecha EventSource ao sair (token removido via camera:token-changed)', async () => {
    renderHook(() => useNotifications(), { wrapper })
    await flush()
    expect(FakeEventSource.instances).toHaveLength(1)

    act(() => {
      localStorage.removeItem('camera_token')
      window.dispatchEvent(new Event('camera:token-changed'))
    })
    await flush()

    expect(FakeEventSource.instances[0].closed).toBe(true)
  })
})

describe('CA5: markReadByEvent — marca como lida a notificação da câmera+instante, usado por qualquer ponto do sistema que iniciar a reprodução do evento', () => {
  it('câmera+time batendo com uma notificação existente marca ela como lida', async () => {
    const result = await setupWithNotification()
    expect(result.current.notifications[0].read).toBe(false)

    act(() => {
      result.current.markReadByEvent('cam1', '2026-01-01T12:00:00Z')
    })

    expect(result.current.notifications[0].read).toBe(true)
    expect(result.current.unreadCount).toBe(0)
  })

  it('câmera diferente com o mesmo instante não marca nada (id não bate)', async () => {
    const result = await setupWithNotification()

    act(() => {
      result.current.markReadByEvent('cam-outra', '2026-01-01T12:00:00Z')
    })

    expect(result.current.notifications[0].read).toBe(false)
  })

  it('instante diferente na mesma câmera não marca nada (id não bate)', async () => {
    const result = await setupWithNotification()

    act(() => {
      result.current.markReadByEvent('cam1', '2026-01-01T00:00:00Z')
    })

    expect(result.current.notifications[0].read).toBe(false)
  })

  it('sem nenhuma notificação correspondente, não lança e não altera o estado', async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper })
    await flush()

    expect(() => {
      act(() => {
        result.current.markReadByEvent('cam-inexistente', '2026-01-01T00:00:00Z')
      })
    }).not.toThrow()
    expect(result.current.notifications).toEqual([])
  })

  // REGRESSÃO (achado do code review): RecordingPlayerModal/VideoBrowserPage/HistoryPage
  // chamam markReadByEvent de dentro de um useEffect com ela própria na dependency array —
  // se a identidade da função mudasse a cada render do NotificationProvider, esse padrão
  // entraria em loop (efeito dispara → markReadByEvent causa um re-render → nova identidade →
  // efeito dispara de novo → ...). Um teste que efetivamente MONTA esse padrão e deixa rodar
  // não é seguro aqui: se o loop reaparecer, é uma cascata SÍNCRONA dentro do commit do React
  // (não passa por nenhum timer), então nenhum timeout do vitest consegue interrompê-la —
  // trava o processo de teste inteiro, não só este arquivo. Em vez disso, verificamos
  // diretamente a causa raiz (a garantia que quebra o loop): a identidade de
  // `markReadByEvent`/`markRead` tem que continuar a MESMA depois de uma chamada (achando ou
  // não uma notificação) seguida de um re-render — sem depender de montar o cenário de loop
  // de verdade.
  it('mantém a mesma identidade entre renders, mesmo depois de marcar (ou tentar marcar) uma notificação — evita o loop de useEffect nos consumidores', async () => {
    const result = await setupWithNotification()
    const markReadByEventBefore = result.current.markReadByEvent
    const markReadBefore = result.current.markRead

    act(() => {
      result.current.markReadByEvent('cam1', '2026-01-01T12:00:00Z') // marca de verdade
    })
    expect(result.current.markReadByEvent).toBe(markReadByEventBefore)
    expect(result.current.markRead).toBe(markReadBefore)

    act(() => {
      result.current.markReadByEvent('cam1', '2026-01-01T12:00:00Z') // já lida, no-op
    })
    expect(result.current.markReadByEvent).toBe(markReadByEventBefore)

    act(() => {
      result.current.markReadByEvent('cam-inexistente', '2026-01-01T00:00:00Z') // não existe, no-op
    })
    expect(result.current.markReadByEvent).toBe(markReadByEventBefore)
  })
})
