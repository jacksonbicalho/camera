import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SystemSettingsTabs from './SystemSettingsTabs'

afterEach(() => {
  cleanup()
})

describe('SystemSettingsTabs', () => {
  it('renderiza as duas abas com os hrefs corretos', () => {
    render(
      <MemoryRouter>
        <SystemSettingsTabs active="config" />
      </MemoryRouter>,
    )
    const config = document.querySelector('a[href="/settings/system"]')
    const stats = document.querySelector('a[href="/settings/stats"]')
    expect(config).not.toBeNull()
    expect(stats).not.toBeNull()
    expect(config?.textContent).toContain('Configuração')
    expect(stats?.textContent).toContain('Estatísticas')
  })

  it('marca a aba Configuração como ativa', () => {
    render(
      <MemoryRouter>
        <SystemSettingsTabs active="config" />
      </MemoryRouter>,
    )
    expect(document.querySelector('a[href="/settings/system"]')?.getAttribute('aria-current')).toBe(
      'page',
    )
    expect(
      document.querySelector('a[href="/settings/stats"]')?.getAttribute('aria-current'),
    ).toBeNull()
  })

  it('marca a aba Estatísticas como ativa', () => {
    render(
      <MemoryRouter>
        <SystemSettingsTabs active="stats" />
      </MemoryRouter>,
    )
    expect(document.querySelector('a[href="/settings/stats"]')?.getAttribute('aria-current')).toBe(
      'page',
    )
    expect(
      document.querySelector('a[href="/settings/system"]')?.getAttribute('aria-current'),
    ).toBeNull()
  })
})
