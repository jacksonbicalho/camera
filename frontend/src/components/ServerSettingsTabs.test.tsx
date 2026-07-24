import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ServerSettingsTabs from './ServerSettingsTabs'
import { getRole } from '../auth'

vi.mock('../auth', () => ({
  getRole: vi.fn(() => 'admin'),
}))

afterEach(() => {
  cleanup()
  vi.mocked(getRole).mockReturnValue('admin')
})

describe('ServerSettingsTabs', () => {
  it('renderiza as 5 abas (admin) com os hrefs corretos', () => {
    render(
      <MemoryRouter>
        <ServerSettingsTabs active="storage" />
      </MemoryRouter>,
    )
    expect(document.querySelector('a[href="/settings/storage"]')?.textContent).toBe('Armazenamento')
    expect(document.querySelector('a[href="/settings/system"]')?.textContent).toBe('Sistema')
    expect(document.querySelector('a[href="/settings/stats"]')?.textContent).toBe('Estatísticas')
    expect(document.querySelector('a[href="/settings/reports"]')?.textContent).toBe('Relatórios')
    expect(document.querySelector('a[href="/settings/about"]')?.textContent).toBe('Sobre')
  })

  it('marca a aba ativa via aria-current', () => {
    render(
      <MemoryRouter>
        <ServerSettingsTabs active="stats" />
      </MemoryRouter>,
    )
    expect(document.querySelector('a[href="/settings/stats"]')?.getAttribute('aria-current')).toBe(
      'page',
    )
    expect(
      document.querySelector('a[href="/settings/storage"]')?.getAttribute('aria-current'),
    ).toBeNull()
  })
})

// CA5: página "Servidor" (5 abas) alterna entre elas e restringe por role.
describe('CA5: abas de Servidor — Armazenamento/Sistema/Estatísticas/Relatórios/Sobre', () => {
  it('admin vê as 5 abas', () => {
    render(
      <MemoryRouter>
        <ServerSettingsTabs active="about" />
      </MemoryRouter>,
    )
    const hrefs = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([
      '/settings/storage',
      '/settings/system',
      '/settings/stats',
      '/settings/reports',
      '/settings/about',
    ])
  })

  it('viewer vê só Estatísticas/Relatórios/Sobre — Armazenamento e Sistema ficam de fora', () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    render(
      <MemoryRouter>
        <ServerSettingsTabs active="about" />
      </MemoryRouter>,
    )
    const hrefs = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/settings/stats', '/settings/reports', '/settings/about'])
  })
})
