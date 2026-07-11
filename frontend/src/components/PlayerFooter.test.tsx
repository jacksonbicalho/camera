import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import PlayerFooter from './PlayerFooter'

afterEach(cleanup)

describe('PlayerFooter', () => {
  it('renderiza o título e é theme-aware (tokens semânticos, não cor fixa)', () => {
    render(<PlayerFooter id="p1-footer" title="Corredor de entrada" />)
    const el = document.getElementById('p1-footer')!
    expect(el.textContent).toContain('Corredor de entrada')
    expect(el.className).toContain('bg-surface')
    expect(el.className).toContain('text-foreground')
    expect(el.className).not.toMatch(/bg-black|text-white/)
  })

  it('sem children, não renderiza área de ações', () => {
    render(<PlayerFooter id="p1-footer" title="Quintal" />)
    expect(document.getElementById('p1-footer-actions')).toBeNull()
  })

  it('com children, renderiza a área de ações à direita', () => {
    render(
      <PlayerFooter id="p1-footer" title="Quintal">
        <button id="p1-footer-mute">mudo</button>
      </PlayerFooter>,
    )
    expect(document.getElementById('p1-footer-actions')).not.toBeNull()
    expect(document.getElementById('p1-footer-mute')).not.toBeNull()
  })

  it('sem title (modo freeform), renderiza só os children, sem linha título+ações', () => {
    render(
      <PlayerFooter id="p1-footer">
        <div id="p1-footer-custom">conteúdo livre</div>
      </PlayerFooter>,
    )
    const el = document.getElementById('p1-footer')!
    expect(el.className).toContain('bg-surface')
    expect(el.className).toContain('text-foreground')
    expect(document.getElementById('p1-footer-custom')).not.toBeNull()
    expect(document.getElementById('p1-footer-actions')).toBeNull()
  })
})
