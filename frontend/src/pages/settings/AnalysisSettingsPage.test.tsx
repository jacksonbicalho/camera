import { afterEach, describe, expect, it, vi } from 'vitest'
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

const trainers = [
  { id: 7, name: 'YOLO principal', type: 'yolo', config: {} },
  { id: 8, name: 'YOLO secundário', type: 'yolo', config: {} },
]

// anyCameraAnalysisEnabled: pelo menos 1 câmera com analysis_enabled=true
// em GET /api/settings/cameras — true por padrão (não afeta os testes que
// não são sobre esse gate).
function mockFetch({
  anyCameraAnalysisEnabled = true,
}: {
  anyCameraAnalysisEnabled?: boolean
} = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const u = String(url)
      if (u === '/api/settings')
        return new Response(JSON.stringify({ cameras: [] }), { status: 200 })
      if (u === '/api/settings/cameras')
        return new Response(
          JSON.stringify([{ id: 'cam1', analysis_enabled: anyCameraAnalysisEnabled }]),
          { status: 200 },
        )
      if (u === '/api/settings/analysis/annotation-count')
        return new Response(JSON.stringify({ count: 1, label_count: 65 }), { status: 200 })
      if (u === '/api/settings/trainers')
        return new Response(JSON.stringify(trainers), { status: 200 })
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

describe('CA6: "Re-analisar tudo" desabilitado durante fine-tuning ativo', () => {
  function mockFetchWithFtStatus(status: 'running' | 'pending') {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (key === 'ft_job_id') return 'job1'
        if (key === 'ft_trainer_id') return '42'
        return null
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url)
        if (u === '/api/settings')
          return new Response(JSON.stringify({ cameras: [] }), { status: 200 })
        if (u === '/api/settings/cameras')
          return new Response(JSON.stringify([{ id: 'cam1', analysis_enabled: true }]), {
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
    mockFetch()
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    renderPage()

    const btn = await screen.findByRole('button', { name: /re-analisar tudo/i })
    await vi.waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false))
  })
})

describe('CA7: "Re-analisar tudo" exige ao menos 1 câmera com análise habilitada', () => {
  it('nenhuma câmera com analysis_enabled, o botão fica desabilitado e explica o motivo', async () => {
    mockFetch({ anyCameraAnalysisEnabled: false })
    renderPage()

    const btn = await screen.findByRole('button', { name: /re-analisar tudo/i })
    await vi.waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(true))
    await screen.findByText(/nenhuma câmera com análise habilitada/i)
  })

  it('com pelo menos 1 câmera com analysis_enabled, o botão continua habilitado', async () => {
    mockFetch({ anyCameraAnalysisEnabled: true })
    renderPage()

    const btn = await screen.findByRole('button', { name: /re-analisar tudo/i })
    await vi.waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByText(/nenhuma câmera com análise habilitada/i)).toBeNull()
  })
})

// CA6 (história feat/detector-por-camera): a análise por gravação passou a
// ser ativada por câmera (CameraAnalysisSection, no cadastro de câmera), não mais por um
// toggle global aqui — e o limiar de confiança também virou por câmera.
describe('CA6: tela de análise global não mostra mais toggle de ativação nem limiar de confiança', () => {
  it('não renderiza "Ativar análise" nem o slider de limiar de confiança', async () => {
    mockFetch()
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
describe('CA6: AnalysisSettingsPage exibe um seletor de trainer cadastrado (fine-tuning)', () => {
  it('busca GET /api/settings/trainers e lista os trainers cadastrados num select', async () => {
    mockFetch()
    renderPage()

    const select = (await screen.findByLabelText(/^trainer$/i)) as HTMLSelectElement
    await vi.waitFor(() => expect(select.textContent).toContain('YOLO principal'))
  })
})

// chore/remover-classificacao-estados-frontend — classificação de estado removida:
// o seletor "Serviço usado por classificação de estado" (#analysis-state-trainer,
// que existia numa 2ª seção própria) sai da página; o seletor de trainer pra
// fine-tuning (CA6 acima) fica intocado.
describe('CA5: classificação de estado removida — sem seletor "Serviço usado por classificação de estado"', () => {
  it('não renderiza mais o select #analysis-state-trainer nem o texto "classificação de estado"', async () => {
    mockFetch()
    renderPage()

    await screen.findByText(/análise de vídeo/i)
    expect(document.getElementById('analysis-state-trainer')).toBeNull()
    expect(screen.queryByText(/classificação de estado/i)).toBeNull()
  })
})
