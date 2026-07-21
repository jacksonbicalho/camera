import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'
import { ClassifierForm } from './CameraStatesSettingsPage'
import type { StateClassifier } from './stateClassifier'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  getRole: () => 'admin',
  onUnauthorized: vi.fn(),
}))

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const u = String(url)
      if (u.includes('/api/settings')) {
        return new Response(JSON.stringify({ storage: { state_history_minutes: 129600 } }), {
          status: 200,
        })
      }
      return new Response('[]', { status: 200 })
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function base(): StateClassifier {
  return {
    name: 'Portão',
    threshold: 0.8,
    trigger_motion: false,
    trigger_interval_seconds: 10,
    crop_x: 0.3,
    crop_y: 0.3,
    crop_w: 0.4,
    crop_h: 0.4,
    min_consecutive: 3,
    enabled: true,
    classes: ['aberto', 'fechado'],
  }
}

function Harness({ initial }: { initial: StateClassifier }) {
  const [value, setValue] = useState(initial)
  return (
    <MemoryRouter>
      <ClassifierForm
        cameraId="cam1"
        value={value}
        onChange={setValue}
        onDone={() => {}}
        onCancel={() => {}}
      />
    </MemoryRouter>
  )
}

describe('CA_UX_retenção_padrão — toggle mostra o valor efetivo da retenção global', () => {
  it('com o toggle marcado (sem override), exibe quantos dias o padrão global guarda', async () => {
    render(<Harness initial={{ ...base(), history_retention_minutes: null }} />)

    await waitFor(() => {
      expect(document.body.textContent).toContain('atualmente 90 dias')
    })
  })

  it('sem override definido (undefined, classificador novo), também exibe o padrão global', async () => {
    render(<Harness initial={base()} />)

    await waitFor(() => {
      expect(document.body.textContent).toContain('atualmente 90 dias')
    })
  })

  it('com override definido, NÃO exibe o texto do padrão global', async () => {
    render(<Harness initial={{ ...base(), history_retention_minutes: 0 }} />)

    await waitFor(() => {
      expect(document.getElementById('state-history-retention-minutes')).toBeTruthy()
    })
    expect(document.body.textContent).not.toContain('atualmente')
  })

  it('antes de /api/settings responder, não mostra nenhum valor (evita piscar "para sempre" incorreto)', async () => {
    let resolveSettings: (r: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn((url: unknown) => {
        const u = String(url)
        if (u.includes('/api/settings')) {
          return new Promise<Response>((resolve) => {
            resolveSettings = resolve
          })
        }
        return Promise.resolve(new Response('[]', { status: 200 }))
      }),
    )

    render(<Harness initial={{ ...base(), history_retention_minutes: null }} />)

    expect(document.body.textContent).not.toContain('atualmente')

    resolveSettings(
      new Response(JSON.stringify({ storage: { state_history_minutes: 129600 } }), {
        status: 200,
      }),
    )

    await waitFor(() => {
      expect(document.body.textContent).toContain('atualmente 90 dias')
    })
  })
})
