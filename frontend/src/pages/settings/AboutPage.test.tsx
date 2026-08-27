import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AboutPage from './AboutPage'
import type { UpdateStatus } from '../../hooks/useUpdates'
import type { AboutInfo } from '../../hooks/useSettings'

afterEach(cleanup)

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

let mockAbout: AboutInfo = {
  version: 'v1.3.0-dev',
  commit: 'abc',
  built_at: '2026-06-25',
  uptime_seconds: 10,
  go_version: 'go1.25',
}

vi.mock('../../hooks/useSettings', () => ({
  useAbout: () => mockAbout,
}))

let mockStatus: UpdateStatus | null
const applyUpdate = vi.fn()
let mockRole: string

vi.mock('../../hooks/useUpdates', () => ({
  useUpdates: () => ({ status: mockStatus, loading: false, reload: vi.fn(), applyUpdate }),
}))

vi.mock('../../auth', () => ({
  getRole: () => mockRole,
}))

beforeEach(() => {
  mockAbout = {
    version: 'v1.3.0-dev',
    commit: 'abc',
    built_at: '2026-06-25',
    uptime_seconds: 10,
    go_version: 'go1.25',
  }
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>,
  )
}

const base: UpdateStatus = {
  current: 'v1.3.0-dev',
  latest: 'v1.4.0-dev',
  notes_md: '### Novidades\n- coisa nova',
  image: 'jacksonbicalho/os-camera:1.4.0-dev',
  update_available: true,
  apply_mode: 'self-replace',
  checked_at: '2026-06-25T00:00:00Z',
  error: '',
}

describe('AboutPage updates section', () => {
  it('mostra nova versão e aplica (self-replace)', async () => {
    mockRole = 'admin'
    mockStatus = { ...base }
    applyUpdate.mockResolvedValue({ ok: true })
    renderPage()

    expect(screen.getByText(/v1\.4\.0-dev/)).toBeTruthy()
    expect(screen.queryByText(/coisa nova/)).toBeNull() // colapsado por padrão (CA4)

    fireEvent.click(screen.getByText('Atualizar agora'))
    expect(applyUpdate).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText(/reiniciar/i)).toBeTruthy())
  })

  it('docker: instruções sem botão', () => {
    mockRole = 'admin'
    mockStatus = { ...base, apply_mode: 'docker' }
    renderPage()

    expect(screen.getByText(/docker compose pull/)).toBeTruthy()
    expect(screen.queryByText('Atualizar agora')).toBeNull()
  })

  it('em dia: não renderiza a seção', () => {
    mockRole = 'admin'
    mockStatus = { ...base, update_available: false }
    renderPage()

    expect(screen.queryByText(/última versão/i)).toBeNull()
    expect(screen.queryByText(/Atualiza/i)).toBeNull()
    expect(screen.queryByText('Atualizar agora')).toBeNull()
  })

  it('erro na checagem: não renderiza a seção', () => {
    mockRole = 'admin'
    mockStatus = { ...base, update_available: false, error: 'boom' }
    renderPage()

    expect(screen.queryByText(/Atualiza/i)).toBeNull()
  })

  it('não-admin não vê a seção', () => {
    mockRole = 'viewer'
    mockStatus = null
    renderPage()

    expect(screen.queryByText(/Atualiza/i)).toBeNull()
  })
})

describe('AboutPage — alerta de atualização integrado ao card', () => {
  it('CA4: última linha do card, changelog colapsado por padrão e expansível; botão ao lado do resumo', () => {
    mockRole = 'admin'
    mockStatus = { ...base }
    renderPage()

    const card = screen.getByText('Informações do servidor').closest('div')!
    const withinCard = within(card)

    // changelog colapsado por padrão
    expect(withinCard.queryByText(/coisa nova/)).toBeNull()

    // resumo da atualização e o botão vivem na mesma linha, dentro do card
    const toggle = withinCard.getByRole('button', { name: /nova versão/i })
    const row = toggle.closest('[data-update-row]')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('Atualizar agora')).toBeTruthy()

    // expande o changelog ao clicar no resumo
    fireEvent.click(toggle)
    expect(withinCard.getByText(/coisa nova/)).toBeTruthy()
  })
})

describe('AboutPage — Release notes', () => {
  it('mostra as notas da última release conhecida, com a versão a que pertencem', () => {
    mockRole = 'viewer'
    mockStatus = null
    mockAbout = {
      ...mockAbout,
      release_notes_version: 'v1.3.0-dev',
      release_notes_md: '### Novidades\n- coisa nova',
    }
    renderPage()

    const section = within(document.getElementById('release-notes-section')!)
    expect(section.getByText('Release notes')).toBeTruthy()
    expect(section.getByText(/v1\.3\.0-dev/)).toBeTruthy()
    expect(section.getByText(/coisa nova/)).toBeTruthy()
  })

  it('segue a hierarquia de headings: título da seção h3, sub-headers do changelog h4', () => {
    mockRole = 'viewer'
    mockStatus = null
    mockAbout = {
      ...mockAbout,
      release_notes_version: 'v0.15.0-rc',
      release_notes_md: '### ✨ Novidades\n- algo',
    }
    renderPage()

    const section = document.getElementById('release-notes-section')!
    expect(section.querySelector('h3')?.textContent).toContain('Release notes')
    expect(section.querySelector('h4')?.textContent).toContain('✨ Novidades')
  })

  it('visível pra qualquer role (não é admin-only, diferente da seção de update)', () => {
    mockRole = 'viewer'
    mockStatus = null
    mockAbout = { ...mockAbout, release_notes_version: 'v1.3.0-dev', release_notes_md: '- x' }
    renderPage()

    expect(screen.getByText('Release notes')).toBeTruthy()
  })

  it('sem release_notes_md (checker não rodou ainda), não renderiza a seção', () => {
    mockRole = 'admin'
    mockStatus = null
    renderPage()

    expect(screen.queryByText('Release notes')).toBeNull()
  })
})
