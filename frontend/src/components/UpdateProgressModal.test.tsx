import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import UpdateProgressModal from './UpdateProgressModal'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'tok',
  onUnauthorized: vi.fn(),
}))

class FakeEventSource {
  static instances: FakeEventSource[] = []
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onopen: (() => void) | null = null
  url: string
  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  close() {}
}

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function currentSource() {
  return FakeEventSource.instances[FakeEventSource.instances.length - 1]
}

describe('UpdateProgressModal', () => {
  it('CA5: renderiza uma linha por step recebido via SSE, na ordem de chegada', async () => {
    render(<UpdateProgressModal open onDone={vi.fn()} />)

    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
    expect(currentSource().url).toContain('/api/updates/apply/live')

    act(() => currentSource().onmessage?.({ data: JSON.stringify({ step: 'downloading' }) }))
    act(() => currentSource().onmessage?.({ data: JSON.stringify({ step: 'snapshot' }) }))

    const lines = screen.getAllByRole('listitem')
    expect(lines.length).toBe(2)
    expect(lines[0].textContent).toMatch(/baix/i)
    expect(lines[1].textContent).toMatch(/snapshot|banco/i)
  })

  it('CA6: conexão caindo após "restarting" mostra reconectando (não erro); reconectar mostra sucesso', async () => {
    const onDone = vi.fn()
    render(<UpdateProgressModal open onDone={onDone} />)
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1))

    act(() => currentSource().onmessage?.({ data: JSON.stringify({ step: 'restarting' }) }))
    act(() => currentSource().onerror?.())

    expect(screen.getByText(/reconectando|reiniciando/i)).toBeTruthy()
    expect(screen.queryByText(/falha|erro/i)).toBeNull()

    act(() => currentSource().onopen?.())

    await waitFor(() => expect(screen.getByText(/sucesso|concluí/i)).toBeTruthy())
    expect(screen.getByRole('button', { name: /fechar|concluir/i })).toBeTruthy()
  })

  it('CA6: conexão caindo ANTES de qualquer step vira erro (nunca falso-sucesso nem trava em "reconectando")', async () => {
    render(<UpdateProgressModal open onDone={vi.fn()} />)
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1))

    // onError dispara sem nenhum onmessage anterior — a fonte nem chegou a
    // publicar o step "restarting", então isso não é a queda esperada do
    // reexec: não pode virar "reconectando" (falso-sucesso se reconectar, ou
    // travamento permanente se não reconectar).
    act(() => currentSource().onerror?.())

    expect(screen.queryByText(/sucesso|concluí/i)).toBeNull()
    expect(screen.getByRole('button', { name: /fechar/i })).toBeTruthy()

    // mesmo que o EventSource reconecte sozinho depois, não promove a
    // sucesso — só um EventUpdateFailed/step real decide o desfecho.
    act(() => currentSource().onopen?.())
    expect(screen.queryByText(/sucesso|concluí/i)).toBeNull()
  })

  it('CA6: EventUpdateFailed explícito mostra estado de erro, sem reconectar', async () => {
    render(<UpdateProgressModal open onDone={vi.fn()} />)
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1))

    act(() =>
      currentSource().onmessage?.({
        data: JSON.stringify({ failed: true, error: 'checksum inválido' }),
      }),
    )

    expect(screen.getByText(/checksum inválido/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /fechar/i })).toBeTruthy()
  })
})
