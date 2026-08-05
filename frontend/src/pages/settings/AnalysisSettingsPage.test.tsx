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

const defaultAnalysisConfig = {
  enabled: true,
  service_url: 'http://yolo:8001',
  model: 'yolo12l',
  confidence_threshold: 0.4,
  has_custom_model: false,
}

function mockFetch(
  modelsResponse: unknown,
  configOverrides: Partial<typeof defaultAnalysisConfig> = {},
) {
  const analysisConfig = { ...defaultAnalysisConfig, ...configOverrides }
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

describe('CA3: seletor de modelo não duplica o grupo "Custom"', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
  })

  it('com custom.pt treinado, não existe uma option "custom" solta (só a rica, "custom ✓ (treinado)")', async () => {
    mockFetch(
      {
        device: 'cuda',
        vram_gb: 4,
        models: [
          { name: 'custom', group: 'Custom', inference: true, finetune: false },
          { name: 'yolo12l', group: 'YOLO12', inference: true, finetune: true },
          { name: 'yolov8n', group: 'YOLOv8', inference: true, finetune: true },
        ],
      },
      { model: 'custom+yolo12l', has_custom_model: true },
    )
    renderPage()

    await screen.findByText(/custom.*treinado/i)

    const bareCustom = screen
      .getAllByRole('option')
      .filter((opt) => opt.textContent?.trim() === 'custom')
    expect(bareCustom).toHaveLength(0)

    const customGroups = document.querySelectorAll('optgroup[label="Custom"]')
    expect(customGroups).toHaveLength(1)
  })
})

function mockFetchWithFtStatus(status: 'running' | 'pending') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const u = String(url)
      if (u === '/api/settings')
        return new Response(JSON.stringify({ cameras: [] }), { status: 200 })
      if (u === '/api/settings/analysis')
        return new Response(JSON.stringify(defaultAnalysisConfig), { status: 200 })
      if (u === '/api/settings/analysis/models')
        return new Response(JSON.stringify({ device: 'cuda', vram_gb: 4, models: [] }), {
          status: 200,
        })
      if (u === '/api/settings/analysis/annotation-count')
        return new Response(JSON.stringify({ count: 1, label_count: 65 }), { status: 200 })
      if (u === '/api/settings/trainers')
        return new Response(
          JSON.stringify([{ id: 42, name: 'YOLO principal', type: 'yolo', config: {} }]),
          { status: 200 },
        )
      if (u === '/api/settings/analysis/finetune/status/job1?trainer_id=42')
        return new Response(JSON.stringify({ status, epoch: 5, total_epochs: 20, error: '' }), {
          status: 200,
        })
      return new Response('{}', { status: 200 })
    }),
  )
}

describe('CA6: "Re-analisar tudo" desabilitado durante fine-tuning ativo', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (key === 'ft_job_id') return 'job1'
        if (key === 'ft_trainer_id') return '42'
        return null
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
  })

  it('com um job de fine-tuning running, o botão fica desabilitado e mostra aviso', async () => {
    mockFetchWithFtStatus('running')
    renderPage()

    const btn = await screen.findByRole('button', { name: /re-analisar tudo/i })
    await screen.findByText(/fine-tuning em andamento/i)
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('com um job de fine-tuning pending, o botão fica desabilitado e mostra aviso', async () => {
    mockFetchWithFtStatus('pending')
    renderPage()

    const btn = await screen.findByRole('button', { name: /re-analisar tudo/i })
    await screen.findByText(/fine-tuning em andamento/i)
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('sem job de fine-tuning ativo, o botão continua habilitado', async () => {
    mockFetch({ device: 'cuda', vram_gb: 4, models: [] })
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    renderPage()

    const btn = await screen.findByRole('button', { name: /re-analisar tudo/i })
    expect((btn as HTMLButtonElement).disabled).toBe(false)
  })
})

// CA6 (história feat/detector-por-camera): a análise por gravação passou a
// ser ativada por câmera (CameraAnalysisSettingsPage), não mais por um
// toggle global aqui — e o limiar de confiança também virou por câmera. O
// form global continua existindo só pra service_url/model (fine-tuning).
describe('CA6: tela de análise global não mostra mais toggle de ativação nem limiar de confiança', () => {
  it('não renderiza "Ativar análise" nem o slider de limiar de confiança', async () => {
    mockFetch({ device: 'cuda', vram_gb: 4, models: [] })
    renderPage()

    await screen.findByText(/análise de vídeo/i)
    expect(screen.queryByText(/ativar análise/i)).toBeNull()
    expect(screen.queryByText(/limiar de confiança/i)).toBeNull()
  })
})

// CA6 (história feat/trainer-adapter-pattern): "Treinar agora" passa a
// exigir um trainer cadastrado escolhido — o fine-tuning não usa mais
// video_analysis_config.ServiceURL direto (internal/trainer, cadastro
// próprio em /settings/trainers).
describe('CA6: AnalysisSettingsPage exibe um seletor de trainer cadastrado', () => {
  it('busca GET /api/settings/trainers e lista os trainers cadastrados num select', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url)
        if (u === '/api/settings')
          return new Response(JSON.stringify({ cameras: [] }), { status: 200 })
        if (u === '/api/settings/analysis')
          return new Response(JSON.stringify(defaultAnalysisConfig), { status: 200 })
        if (u === '/api/settings/analysis/models')
          return new Response(JSON.stringify({ device: 'cuda', vram_gb: 4, models: [] }), {
            status: 200,
          })
        if (u === '/api/settings/analysis/annotation-count')
          return new Response(JSON.stringify({ count: 1, label_count: 5 }), { status: 200 })
        if (u === '/api/settings/trainers')
          return new Response(
            JSON.stringify([{ id: 7, name: 'YOLO principal', type: 'yolo', config: {} }]),
            { status: 200 },
          )
        return new Response('{}', { status: 200 })
      }),
    )

    renderPage()

    const select = (await screen.findByLabelText(/trainer/i)) as HTMLSelectElement
    expect(select.textContent).toContain('YOLO principal')
  })
})
