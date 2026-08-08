import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import CameraAnalysisSettingsPage from './CameraAnalysisSettingsPage'

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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/analyses/cam-1']}>
      <Routes>
        <Route path="/settings/analyses/:id" element={<CameraAnalysisSettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// CA5 (história feat/detector-por-camera): a página deixa de ser um toggle
// binário amarrado à config global e passa a escolher, por câmera, qual
// detector cadastrado usar + o limiar de confiança daquela câmera.
describe('CA5: tela de análise por câmera permite escolher detector cadastrado e definir o limiar', () => {
  it('lista os detectores cadastrados e salva detector_id + confidence_threshold ao escolher um', async () => {
    let putBody: Record<string, unknown> | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        const u = String(url)
        if (u === '/api/settings/cameras/cam-1/analysis' && (!init || init.method === undefined)) {
          return new Response(JSON.stringify({ enabled: true, detector_id: null }), { status: 200 })
        }
        if (u === '/api/settings/detectors') {
          return new Response(
            JSON.stringify([
              { id: 1, name: 'YOLOv8-nano', config: { service_url: 'http://yolo:8001' } },
              { id: 2, name: 'YOLOv8-small', config: { service_url: 'http://yolo:8002' } },
            ]),
            { status: 200 },
          )
        }
        if (u === '/api/settings/cameras/cam-1/analysis' && init?.method === 'PUT') {
          putBody = JSON.parse(init.body as string)
          return new Response(JSON.stringify(putBody), { status: 200 })
        }
        return new Response('{}', { status: 200 })
      }),
    )

    renderPage()

    const detectorSelect = (await screen.findByLabelText(/detector/i)) as HTMLSelectElement
    fireEvent.change(detectorSelect, { target: { value: '2' } })

    const thresholdInput = screen.getByLabelText(/limiar/i) as HTMLInputElement
    fireEvent.change(thresholdInput, { target: { value: '0.6' } })

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(putBody).not.toBeNull()
    })
    expect(putBody).toMatchObject({ detector_id: 2, confidence_threshold: 0.6 })
  })
})

// CA3 (história fix/camera-analysis-toggle): mesmo padrão de
// CameraMotionSettingsPage — checkbox "Habilitado" independente do
// detector escolhido; a seção de detector/limiar só aparece quando
// marcado. Antes, `enabled` era derivado de `detectorId !== ''` — não
// existia um jeito de desligar a análise sem "esquecer" o detector
// escolhido.
describe('CA3: checkbox "Habilitado" controla enabled diretamente; seção de configuração só aparece quando marcado', () => {
  function mockAnalysisFetch(cfg: { enabled: boolean; detector_id: number | null }) {
    let putBody: Record<string, unknown> | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        const u = String(url)
        if (u === '/api/settings/cameras/cam-1/analysis' && (!init || init.method === undefined)) {
          return new Response(JSON.stringify(cfg), { status: 200 })
        }
        if (u === '/api/settings/detectors') {
          return new Response(
            JSON.stringify([
              { id: 1, name: 'YOLOv8-nano', config: { service_url: 'http://yolo:8001' } },
            ]),
            { status: 200 },
          )
        }
        if (u === '/api/settings/cameras/cam-1/analysis' && init?.method === 'PUT') {
          putBody = JSON.parse(init.body as string)
          return new Response(JSON.stringify(putBody), { status: 200 })
        }
        return new Response('{}', { status: 200 })
      }),
    )
    return () => putBody
  }

  it('com enabled=false, a seção de detector/limiar fica escondida; marcar o checkbox revela', async () => {
    mockAnalysisFetch({ enabled: false, detector_id: null })
    renderPage()

    const checkbox = (await screen.findByLabelText(/habilitado/i)) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    expect(screen.queryByLabelText(/detector/i)).toBeNull()

    fireEvent.click(checkbox)
    expect(await screen.findByLabelText(/detector/i)).toBeTruthy()
  })

  it('ao desmarcar o checkbox (com detector já escolhido) e salvar, manda enabled:false — não deriva mais de detectorId', async () => {
    const getPutBody = mockAnalysisFetch({ enabled: true, detector_id: 1 })
    renderPage()

    const checkbox = (await screen.findByLabelText(/habilitado/i)) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    expect(await screen.findByLabelText(/detector/i)).toBeTruthy()

    fireEvent.click(checkbox)
    expect(screen.queryByLabelText(/detector/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(getPutBody()).not.toBeNull()
    })
    // detector_id sobrevive ao desabilitar — desmarcar o checkbox não deve
    // "esquecer" o detector já escolhido (o sintoma que motivou esta
    // história: enabled derivado de detectorId apagava a escolha).
    expect(getPutBody()).toMatchObject({ enabled: false, detector_id: 1 })
  })

  it('com enabled=true e nenhum detector escolhido, o botão Salvar fica desabilitado; escolher um detector habilita', async () => {
    mockAnalysisFetch({ enabled: true, detector_id: null })
    renderPage()

    const saveBtn = (await screen.findByRole('button', { name: /salvar/i })) as HTMLButtonElement
    expect(saveBtn.disabled).toBe(true)
    expect(await screen.findByText(/selecione um detector/i)).toBeTruthy()

    const detectorSelect = screen.getByLabelText(/detector/i) as HTMLSelectElement
    fireEvent.change(detectorSelect, { target: { value: '1' } })

    expect(saveBtn.disabled).toBe(false)
    expect(screen.queryByText(/selecione um detector/i)).toBeNull()
  })
})

// CA5 (história refactor/camera-tabs-para-sidebar-ia): a página passa a viver
// em /settings/analyses/:id (chegando pela seção Inteligência Artificial em
// vez da aba da câmera) e ganha um <select> pra trocar de câmera sem voltar
// pra uma landing — mesmo padrão de report-camera-select em ReportsPage
// (fetch /api/cameras direto, não via useSettings; ao trocar, navega replace
// pra /settings/analyses/<nova câmera>).
function LocationProbe() {
  const location = useLocation()
  return <div id="test-location">{location.pathname}</div>
}

function renderAtAnalysesRoute(initial = '/settings/analyses/cam-1') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/settings/analyses/:id" element={<CameraAnalysisSettingsPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('CA5: <select id="analysis-camera-select"> troca de câmera sem voltar pra uma landing', () => {
  it('lista as câmeras (via GET /api/cameras) e, ao trocar, navega pra /settings/analyses/<nova câmera>', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url)
        if (u === '/api/cameras') {
          return new Response(
            JSON.stringify([
              { id: 'cam-1', name: 'Entrada' },
              { id: 'cam-2', name: 'Quintal' },
            ]),
            { status: 200 },
          )
        }
        if (
          u === '/api/settings/cameras/cam-1/analysis' ||
          u === '/api/settings/cameras/cam-2/analysis'
        ) {
          return new Response(JSON.stringify({ enabled: false, detector_id: null }), {
            status: 200,
          })
        }
        if (u === '/api/settings/detectors') {
          return new Response(JSON.stringify([]), { status: 200 })
        }
        return new Response('{}', { status: 200 })
      }),
    )

    renderAtAnalysesRoute()

    const select = (await screen.findByLabelText(/câmera/i)) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'cam-2' } })

    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/settings/analyses/cam-2')
    })
  })
})
