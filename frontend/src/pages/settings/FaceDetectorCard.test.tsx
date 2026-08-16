import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import FaceDetectorCard from './FaceDetectorCard'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))

function mockFetch(
  faceDetector: { available: boolean; active: boolean },
  putSpy?: (body: unknown) => void,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url)
      if (u === '/api/settings/extensions' && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify([
            {
              id: 'face-detector',
              name: 'Face Detector',
              category: 'Análise',
              description: 'Detecta rostos nas gravações da câmera.',
              available: faceDetector.available,
              active: faceDetector.active,
            },
          ]),
          { status: 200 },
        )
      }
      if (u === '/api/settings/extensions/face-detector' && init?.method === 'PUT') {
        const body = init.body ? JSON.parse(String(init.body)) : null
        putSpy?.(body)
        return new Response('{}', { status: 200 })
      }
      return new Response('{}', { status: 200 })
    }),
  )
}

function switchChecked(el: HTMLElement) {
  return el.getAttribute('aria-checked') === 'true'
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CA3: FaceDetectorCard mostra o toggle refletindo a API e aplica via PUT', () => {
  it('mostra o toggle refletindo active=true vindo da API', async () => {
    mockFetch({ available: true, active: true })
    render(<FaceDetectorCard />)

    const toggle = await screen.findByRole('switch')
    await waitFor(() => expect(switchChecked(toggle)).toBe(true))
  })

  it('alterar o toggle e clicar "Aplicar" dispara PUT /api/settings/extensions/face-detector com o novo valor', async () => {
    let putBody: unknown = null
    mockFetch({ available: true, active: false }, (body) => {
      putBody = body
    })
    render(<FaceDetectorCard />)

    const toggle = await screen.findByRole('switch')
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: /aplicar/i }))

    await waitFor(() => {
      expect(putBody).toEqual({ active: true })
    })
  })

  it('quando a extensão não está disponível, mostra o toggle/Aplicar travados (não escondidos) — mesma altura do card habilitado', async () => {
    mockFetch({ available: false, active: false })
    render(<FaceDetectorCard />)

    await screen.findByText('Extensão não permitida nesta instância.')
    const toggle = screen.getByRole('switch') as HTMLButtonElement
    expect(toggle.closest('fieldset')?.disabled).toBe(true)
    const applyButton = screen.getByRole('button', { name: /aplicar/i }) as HTMLButtonElement
    expect(applyButton.closest('fieldset')?.disabled).toBe(true)
  })
})
