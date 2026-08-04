import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import DiscoverPage from './DiscoverPage'

function LocationProbe() {
  const loc = useLocation()
  return (
    <div data-testid="location-probe">
      {loc.pathname}
      {loc.search}
    </div>
  )
}

afterEach(cleanup)

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
}))

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}))

function mockDiscoverFetch() {
  return vi.fn((url: string) => {
    if (url === '/api/settings/cameras') {
      return Promise.resolve({ ok: true, json: async () => [] })
    }
    if (url === '/api/discover') {
      return Promise.resolve({
        ok: true,
        json: async () => [
          { ip: '192.168.1.10', port: 554, onvif: true, name: 'Camera A' },
          { ip: '192.168.1.20', port: 554, onvif: false },
        ],
      })
    }
    return Promise.resolve({ ok: false, json: async () => null })
  })
}

describe('CA6: DiscoverPage — resultados em Card, sem tabela de largura fixa', () => {
  it('renderiza os resultados como cards (sem <table>), preservando IP/Porta/Método/Nome/Ação', async () => {
    global.fetch = mockDiscoverFetch()

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('192.168.1.10')).toBeTruthy())

    // estrutura: nunca mais uma <table> — é isso que causava o corte no
    // mobile (wrapper com overflow-hidden sobre colunas de largura fixa).
    expect(document.querySelector('table')).toBeNull()

    // resultado 1 (ONVIF, com nome do scan).
    const card1 = document.getElementById('discover-result-0')
    expect(card1).not.toBeNull()
    expect(card1?.textContent).toContain('192.168.1.10')
    expect(card1?.textContent).toContain('554')
    expect(card1?.textContent).toContain('ONVIF')
    expect(card1?.textContent).toContain('Camera A')
    expect(card1?.querySelector('button')?.textContent).toContain('Adicionar')

    // resultado 2 (scan de porta, sem nome — fallback "—").
    const card2 = document.getElementById('discover-result-1')
    expect(card2).not.toBeNull()
    expect(card2?.textContent).toContain('192.168.1.20')
    expect(card2?.textContent).toContain('Scan')
    expect(card2?.textContent).toContain('—')
  })

  it('CA6: câmera já cadastrada não mostra o botão Adicionar', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url === '/api/settings/cameras') {
        return Promise.resolve({
          ok: true,
          json: async () => [{ id: 'cam1', name: 'Hall', rtsp_url: 'rtsp://192.168.1.10/x' }],
        })
      }
      if (url === '/api/discover') {
        return Promise.resolve({
          ok: true,
          json: async () => [{ ip: '192.168.1.10', port: 554, onvif: true }],
        })
      }
      if (url === '/api/cameras/cam1/device-info') {
        return Promise.resolve({ ok: false, json: async () => null })
      }
      return Promise.resolve({ ok: false, json: async () => null })
    }) as unknown as typeof fetch

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText(/Já cadastrada como/)).toBeTruthy())
    expect(screen.queryByText('Adicionar')).toBeNull()
  })

  it('CA6: Adicionar abre o formulário de credenciais; Cancelar volta ao estado inicial', async () => {
    global.fetch = mockDiscoverFetch()

    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('192.168.1.10')).toBeTruthy())
    const card = document.getElementById('discover-result-0')!

    fireEvent.click(within(card).getByText('Adicionar'))
    expect(within(card).getByPlaceholderText('Usuário')).toBeTruthy()
    expect(within(card).getByPlaceholderText('Senha')).toBeTruthy()
    expect(within(card).getByText('Confirmar')).toBeTruthy()
    expect(within(card).queryByText('Adicionar')).toBeNull()

    fireEvent.click(within(card).getByText('Cancelar'))
    expect(within(card).queryByPlaceholderText('Usuário')).toBeNull()
    expect(within(card).getByText('Adicionar')).toBeTruthy()
  })

  it('CA6: fluxo ONVIF completo — credenciais (Enter) → streams → seleção navega com a URL do stream', async () => {
    // Corpo da requisição capturado aqui (em vez de `expect` dentro do mock)
    // de propósito: `confirmCreds` (DiscoverPage.tsx) envolve esse fetch num
    // try/catch com fallback silencioso — um `expect` lançado ali dentro
    // seria engolido pelo catch, e a falha só apareceria bem mais adiante
    // (timeout esperando os streams), sem apontar pra causa real.
    let streamsRequestBody: unknown
    global.fetch = vi.fn((url: string, opts?: RequestInit) => {
      if (url === '/api/settings/cameras') {
        return Promise.resolve({ ok: true, json: async () => [] })
      }
      if (url === '/api/discover') {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              ip: '192.168.1.10',
              port: 554,
              onvif: true,
              onvif_xaddr: 'http://192.168.1.10/onvif/device_service',
              name: 'Camera A',
            },
          ],
        })
      }
      if (url === '/api/discover/streams') {
        streamsRequestBody = JSON.parse(String(opts?.body))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            streams: [{ name: 'main', url: 'rtsp://admin:secret@192.168.1.10:554/main' }],
          }),
        })
      }
      return Promise.resolve({ ok: false, json: async () => null })
    }) as unknown as typeof fetch

    render(
      <MemoryRouter>
        <DiscoverPage />
        <LocationProbe />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('192.168.1.10')).toBeTruthy())
    const card = document.getElementById('discover-result-0')!

    fireEvent.click(within(card).getByText('Adicionar'))
    fireEvent.change(within(card).getByPlaceholderText('Usuário'), {
      target: { value: 'admin' },
    })
    const passInput = within(card).getByPlaceholderText('Senha')
    fireEvent.change(passInput, { target: { value: 'secret' } })
    fireEvent.keyDown(passInput, { key: 'Enter' })

    await waitFor(() => expect(within(card).getByText('main')).toBeTruthy())
    fireEvent.click(within(card).getByText('main'))

    await waitFor(() =>
      expect(screen.getByTestId('location-probe').textContent).toContain('/settings/cameras/new'),
    )
    const probe = screen.getByTestId('location-probe').textContent ?? ''
    expect(probe).toContain(encodeURIComponent('rtsp://admin:secret@192.168.1.10:554/main'))
    expect(probe).toContain('prefill_name=Camera')

    expect(streamsRequestBody).toEqual({
      onvif_xaddr: 'http://192.168.1.10/onvif/device_service',
      user: 'admin',
      pass: 'secret',
    })
  })
})
