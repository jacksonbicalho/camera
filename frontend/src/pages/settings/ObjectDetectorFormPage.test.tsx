import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ObjectDetectorFormPage from './ObjectDetectorFormPage'

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

describe('CA6: formulário de edição pré-carrega os dados do detector existente', () => {
  it('preenche o campo nome com o valor vindo da API ao editar (rota dedicada /settings/detectors/edit/:id)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                id: 7,
                name: 'YOLOv8-nano',
                config: {
                  service_url: 'http://yolo:8001',
                  model: 'yolov8n',
                  confidence_threshold: '0.4',
                },
              },
            ]),
            { status: 200 },
          ),
      ),
    )

    render(
      <MemoryRouter initialEntries={['/settings/detectors/edit/7']}>
        <Routes>
          <Route path="/settings/detectors/edit/:id" element={<ObjectDetectorFormPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const nameInput = (await screen.findByLabelText(/nome/i)) as HTMLInputElement
    expect(nameInput.value).toBe('YOLOv8-nano')
  })
})
