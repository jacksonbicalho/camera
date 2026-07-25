import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AnalysisSettingsPage from './AnalysisSettingsPage'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const analysisConfig = {
  enabled: true,
  service_url: 'http://yolo:8001',
  model: 'yolo12l',
  confidence_threshold: 0.4,
  has_custom_model: false,
}

function mockFetch(modelsResponse: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const u = String(url)
      if (u === '/api/settings')
        return new Response(JSON.stringify({ cameras: [] }), { status: 200 })
      if (u === '/api/settings/analysis')
        return new Response(JSON.stringify(analysisConfig), { status: 200 })
      if (u === '/api/settings/analysis/models')
        return new Response(JSON.stringify(modelsResponse), { status: 200 })
      if (u === '/api/settings/analysis/annotation-count')
        return new Response(JSON.stringify({ count: 1, label_count: 65 }), { status: 200 })
      return new Response('{}', { status: 200 })
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AnalysisSettingsPage />
    </MemoryRouter>,
  )
}

describe('CA2: mensagem de fine-tuning indisponível diferencia serviço sem GPU de GPU insuficiente', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
  })

  it('serviço sem GPU (device=cpu): avisa que nenhum modelo serve, sem sugerir yolov8n/yolo11n', async () => {
    mockFetch({
      device: 'cpu',
      vram_gb: 0,
      models: [
        { name: 'yolo12l', group: 'YOLO12', inference: true, finetune: false },
        { name: 'yolov8n', group: 'YOLOv8', inference: true, finetune: false },
      ],
    })
    renderPage()

    await screen.findByText(/sem gpu/i)
    expect(screen.queryByText(/selecione um modelo menor/i)).toBeNull()
  })

  it('GPU insuficiente pro modelo (device=cuda): cita o vram_gb real disponível', async () => {
    mockFetch({
      device: 'cuda',
      vram_gb: 2,
      models: [
        { name: 'yolo12l', group: 'YOLO12', inference: true, finetune: false },
        { name: 'yolov8n', group: 'YOLOv8', inference: true, finetune: true },
      ],
    })
    renderPage()

    await screen.findByText(/selecione um modelo menor/i)
    expect(screen.getByText(/2 ?gb/i)).toBeTruthy()
  })
})
