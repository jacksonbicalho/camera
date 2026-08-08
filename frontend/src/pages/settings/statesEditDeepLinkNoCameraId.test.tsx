import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CameraStatesSettingsPage from './CameraStatesSettingsPage'

vi.mock('../../auth', () => ({
  getRole: () => 'admin',
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))
vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../components/CameraSettingsTabs', () => ({ default: () => <div /> }))

const classifier = {
  id: 42,
  camera_id: 'cam1',
  name: 'Portão',
  classes: ['aberto', 'fechado'],
  trigger_interval_seconds: 10,
  threshold: 0.8,
  enabled: true,
  crop_x: 0.1,
  crop_y: 0.1,
  crop_w: 0.3,
  crop_h: 0.3,
  trigger_motion: false,
  min_consecutive: 3,
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/settings/states/edit/:cid" element={<CameraStatesSettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// CA7 (história refactor/camera-tabs-para-sidebar-ia): a rota de edição de um
// classificador deixa de carregar o id da câmera na URL — entrar direto em
// /settings/states/edit/:cid (deep-link puro, ex. vindo de uma notificação,
// sem passar pela lista /settings/states/:id antes) precisa resolver o
// camera_id via GET /api/settings/classifiers/{cid} e então carregar o form
// do classificador certo.
describe('CA7: deep-link direto em /settings/states/edit/:cid (sem :id de câmera) resolve o camera_id e carrega o classificador certo', () => {
  it('chama GET /api/settings/classifiers/{cid}, resolve camera_id=cam1, e o form abre com o classificador certo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url)
        if (u === '/api/settings/classifiers/42') {
          return new Response(JSON.stringify(classifier), { status: 200 })
        }
        if (u === '/api/settings/cameras/cam1/classifiers') {
          return new Response(JSON.stringify([classifier]), { status: 200 })
        }
        if (u.includes('/state'))
          return new Response(JSON.stringify({ state: '' }), { status: 200 })
        if (u === '/api/settings/analysis')
          return new Response(JSON.stringify({ state_trainer_id: 1 }), { status: 200 })
        return new Response('[]', { status: 200 })
      }),
    )

    renderAt('/settings/states/edit/42')

    await waitFor(() => {
      const input = document.querySelector<HTMLInputElement>('#state-config-card input')
      expect(input?.value).toBe('Portão')
    })
  })
})

function renderAtListAndEdit(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/settings/states/:id" element={<CameraStatesSettingsPage />} />
        <Route path="/settings/states/edit/:cid" element={<CameraStatesSettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Regressão encontrada no code review de T3: clicar em "Editar" na lista
// (fluxo normal, não deep-link) navega pra /settings/states/edit/:cid sem
// desmontar o componente (mesmo elemento em ambas as rotas — ver CLAUDE.md
// "Padrão: edição via rota dedicada"). Sem propagar o camera_id já
// conhecido (é a câmera da própria lista) ANTES de navegar, o próximo
// render perderia `id` até o round-trip de GET /api/settings/classifiers/
// {cid} terminar — chegando a disparar fetch com "undefined" na URL.
describe('CA7: clicar em "Editar" na lista (não deep-link) nunca perde o camera_id nem chama fetch com "undefined" na URL', () => {
  it('abre o form do classificador certo imediatamente, sem nenhuma URL contendo "undefined"', async () => {
    const calledUrls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const u = String(url)
        calledUrls.push(u)
        if (u === '/api/settings/cameras/cam1/classifiers') {
          return new Response(JSON.stringify([classifier]), { status: 200 })
        }
        if (u === '/api/settings/classifiers/42') {
          return new Response(JSON.stringify(classifier), { status: 200 })
        }
        if (u.includes('/state'))
          return new Response(JSON.stringify({ state: '' }), { status: 200 })
        if (u === '/api/settings/analysis')
          return new Response(JSON.stringify({ state_trainer_id: 1 }), { status: 200 })
        return new Response('[]', { status: 200 })
      }),
    )

    renderAtListAndEdit('/settings/states/cam1')

    await screen.findByText('Portão')
    fireEvent.click(screen.getByTitle('Editar'))

    await waitFor(() => {
      const input = document.querySelector<HTMLInputElement>('#state-config-card input')
      expect(input?.value).toBe('Portão')
    })

    expect(calledUrls.some((u) => u.includes('undefined'))).toBe(false)
  })
})
