import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SettingsNavGroups from './SettingsNavGroups'
import type { SettingsNavGroup } from './settingsNavLinks'

afterEach(cleanup)

const groups: SettingsNavGroup[] = [
  {
    header: 'Grupo A',
    items: [
      { to: '/a', label: 'Link A' },
      { to: '/servidor', label: 'Servidor', activePrefixes: ['/outra-aba'] },
      {
        kind: 'picker',
        id: 'picker-a',
        label: 'Picker A',
        activePrefix: '/picked',
        buildTarget: (id) => `/picked/${id}`,
      },
    ],
  },
]

function renderAt(path: string, onSelect?: () => void) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SettingsNavGroups groups={groups} ariaLabel="Teste" onSelect={onSelect} />
    </MemoryRouter>,
  )
}

describe('SettingsNavGroups', () => {
  it('mostra o cabeçalho do grupo e um link por item "link"', () => {
    renderAt('/a')
    expect(document.body.textContent).toContain('Grupo A')
    expect(document.querySelector('a[href="/a"]')?.textContent).toBe('Link A')
    expect(document.querySelector('a[href="/servidor"]')?.textContent).toBe('Servidor')
  })

  it('renderiza item "picker" como botão, não link', () => {
    renderAt('/a')
    const picker = document.getElementById('picker-a')!
    expect(picker.tagName).toBe('BUTTON')
  })

  it('marca um link ativo tanto pela própria rota quanto por activePrefixes', () => {
    renderAt('/outra-aba')
    const link = document.querySelector('a[href="/servidor"]')!
    expect(link.className).toContain('font-medium')
  })

  it('seta aria-current="page" quando ativo só por activePrefixes (não pela própria rota)', () => {
    renderAt('/outra-aba')
    expect(document.querySelector('a[href="/servidor"]')?.getAttribute('aria-current')).toBe('page')
    expect(document.querySelector('a[href="/a"]')?.getAttribute('aria-current')).toBeNull()
  })

  it('não marca outros links como ativos', () => {
    renderAt('/outra-aba')
    const link = document.querySelector('a[href="/a"]')!
    expect(link.className).not.toContain('font-medium')
  })

  it('chama onSelect ao clicar num link', () => {
    const onSelect = vi.fn()
    renderAt('/a', onSelect)
    fireEvent.click(document.querySelector('a[href="/a"]')!)
    expect(onSelect).toHaveBeenCalled()
  })

  it('chama onSelect ao navegar pelo picker (via onNavigate repassado)', async () => {
    const onSelect = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'cam1', name: 'Cam' }]) }),
      ),
    )
    renderAt('/a', onSelect)
    fireEvent.click(document.getElementById('picker-a')!)
    await waitFor(() => expect(document.getElementById('picker-a-camera-cam1')).toBeTruthy())
    fireEvent.click(document.getElementById('picker-a-camera-cam1')!)
    await waitFor(() => expect(onSelect).toHaveBeenCalled())
    vi.unstubAllGlobals()
  })
})
