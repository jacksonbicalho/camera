import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ObjectDetectorsSettingsPage from './ObjectDetectorsSettingsPage'

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

describe('CA5: lista detectores cadastrados com link para criar novo', () => {
  it('mostra o nome dos detectores retornados pela API e um link para /settings/detectors/new', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                id: 1,
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
      <MemoryRouter>
        <ObjectDetectorsSettingsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('YOLOv8-nano')).toBeTruthy()
    const link = screen.getByRole('link', { name: /novo detector/i })
    expect(link.getAttribute('href')).toBe('/settings/detectors/new')
  })
})
