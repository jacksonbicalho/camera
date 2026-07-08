import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SettingsLayout from './SettingsLayout'

vi.mock('./AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../auth', () => ({ getRole: () => 'admin' }))

afterEach(() => cleanup())

describe('SettingsLayout — link Estatísticas', () => {
  it('não exibe mais o link "Estatísticas" (migrou pro sidebar novo/Preferências, StatsPage saiu do SettingsLayout)', () => {
    render(
      <MemoryRouter>
        <SettingsLayout><div /></SettingsLayout>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: 'Estatísticas' })).toBeNull()
  })
})
