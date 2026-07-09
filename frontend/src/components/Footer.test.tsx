import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import Footer from './Footer'

afterEach(cleanup)

describe('Footer', () => {
  it('renderiza o conteúdo estático dentro de <footer> (role contentinfo) com id default "footer"', () => {
    render(<Footer />)
    const footer = screen.getByRole('contentinfo')
    expect(footer.id).toBe('footer')
    expect(footer.textContent).toContain(`© ${new Date().getFullYear()} os-camera · Monitoramento`)
    expect(footer.className).toContain('text-center')
  })

  it('respeita id e className sobrescritos', () => {
    render(<Footer id="video-browser-footer" className="mt-8" />)
    const footer = screen.getByRole('contentinfo')
    expect(footer.id).toBe('video-browser-footer')
    expect(footer.className).toContain('mt-8')
  })
})
