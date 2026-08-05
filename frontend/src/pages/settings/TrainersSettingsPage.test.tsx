import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TrainersSettingsPage from './TrainersSettingsPage'

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

// CA5 (história feat/trainer-adapter-pattern): nova página /settings/trainers
// — mirror de ObjectDetectorsSettingsPage — lista os trainers cadastrados
// via GET /api/settings/trainers e tem um link pra cadastrar um novo.
describe('CA5: lista trainers cadastrados com link para criar novo', () => {
  it('mostra o nome dos trainers retornados pela API e um link para /settings/trainers/new', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                id: 1,
                name: 'YOLO principal',
                type: 'yolo',
                config: { service_url: 'http://yolo:8001' },
              },
            ]),
            { status: 200 },
          ),
      ),
    )

    render(
      <MemoryRouter>
        <TrainersSettingsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('YOLO principal')).toBeTruthy()
    const link = screen.getByRole('link', { name: /novo trainer/i })
    expect(link.getAttribute('href')).toBe('/settings/trainers/new')
  })
})
