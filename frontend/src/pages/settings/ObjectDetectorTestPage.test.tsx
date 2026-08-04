import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ObjectDetectorTestPage from './ObjectDetectorTestPage'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CA7: tela de teste envia upload e exibe as detecções retornadas', () => {
  it('mostra os labels devolvidos pelo endpoint de teste após o upload de um arquivo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        if (String(url).endsWith('/test')) {
          return new Response(
            JSON.stringify({ detections: [{ label: 'person', confidence: 0.92, frame_count: 1 }] }),
            { status: 200 },
          )
        }
        return new Response('{}', { status: 200 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/settings/detectors/test/7']}>
        <Routes>
          <Route path="/settings/detectors/test/:id" element={<ObjectDetectorTestPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const fileInput = screen.getByLabelText(/arquivo/i) as HTMLInputElement
    const file = new File(['fake-bytes'], 'test.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    expect(await screen.findByText(/person/i)).toBeTruthy()
  })
})

// CA8 (história feat/detector-por-camera): a tela de teste ganha um campo de
// limiar avulso, enviado junto do upload — só pra aquela chamada, nunca
// persistido no detector (T6 removeu o campo do cadastro).
describe('CA8: tela de teste envia o limiar avulso no upload do arquivo', () => {
  it('inclui o valor do campo de limiar no FormData enviado ao endpoint de teste', async () => {
    let sentThreshold: string | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        if (String(url).endsWith('/test')) {
          const body = init?.body as FormData
          sentThreshold = body.get('confidence_threshold') as string | null
          return new Response(JSON.stringify({ detections: [] }), { status: 200 })
        }
        return new Response('{}', { status: 200 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/settings/detectors/test/7']}>
        <Routes>
          <Route path="/settings/detectors/test/:id" element={<ObjectDetectorTestPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const thresholdInput = screen.getByLabelText(/limiar/i) as HTMLInputElement
    fireEvent.change(thresholdInput, { target: { value: '0.6' } })

    const fileInput = screen.getByLabelText(/arquivo/i) as HTMLInputElement
    const file = new File(['fake-bytes'], 'test.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await screen.findByText(/nenhuma detecção/i)
    expect(sentThreshold).toBe('0.6')
  })
})
