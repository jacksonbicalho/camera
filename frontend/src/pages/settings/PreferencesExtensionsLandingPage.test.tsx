import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import PreferencesExtensionsLandingPage from './PreferencesExtensionsLandingPage'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
}))
vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

function LocationProbe() {
  const location = useLocation()
  return <div id="test-location">{location.pathname}</div>
}

function renderAt() {
  render(
    <MemoryRouter initialEntries={['/settings/preferences/extensions']}>
      <Routes>
        <Route
          path="/settings/preferences/extensions"
          element={<PreferencesExtensionsLandingPage />}
        />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// CA5: /settings/preferences/extensions (sem id) nunca mostra um picker —
// navega direto pra a 1ª extensão da lista, mesmo padrão de
// HistoryLandingPage/StatesLandingPage.
describe('CA5: /settings/preferences/extensions nunca mostra um picker — navega direto pra a 1ª extensão', () => {
  it('com extensões cadastradas, navega pra /settings/preferences/extensions/<1ª>', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: 'telegram', name: 'Telegram' },
              { id: 's3', name: 'S3' },
            ]),
        }),
      ),
    )
    renderAt()
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe(
        '/settings/preferences/extensions/telegram',
      )
    })
  })

  it('sem nenhuma extensão, mostra mensagem (sem navegar pra lugar nenhum)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
    )
    renderAt()
    await waitFor(() => {
      expect(document.body.textContent).toContain('Nenhuma extensão disponível.')
    })
    expect(document.getElementById('test-location')!.textContent).toBe(
      '/settings/preferences/extensions',
    )
  })
})
