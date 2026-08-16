import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { TelegramIcon } from './TelegramIcon'

afterEach(cleanup)

describe('CA2: TelegramIcon — logo oficial colorido (círculo gradiente + avião branco), não o path mono da simple-icons', () => {
  it('renderiza um <circle> preenchido por um linearGradient com os stops #2AABEE/#229ED9', () => {
    const { container } = render(<TelegramIcon />)
    const circle = container.querySelector('circle')
    expect(circle).toBeTruthy()
    const fill = circle?.getAttribute('fill') ?? ''
    expect(fill).toMatch(/^url\(#.+\)$/)
    const gradientId = fill.slice(5, -1).replace(/^#/, '')
    const gradient = container.querySelector(`linearGradient#${CSS.escape(gradientId)}`)
    expect(gradient).toBeTruthy()
    const stops = gradient ? Array.from(gradient.querySelectorAll('stop')) : []
    expect(stops.map((s) => s.getAttribute('stop-color'))).toEqual(['#2AABEE', '#229ED9'])
  })

  it('renderiza um <path> branco (o avião de papel)', () => {
    const { container } = render(<TelegramIcon />)
    const path = container.querySelector('path')
    expect(path).toBeTruthy()
    expect(path?.getAttribute('fill')).toBe('#FFFFFF')
  })

  it('duas instâncias montadas juntas não colidem no id do gradiente', () => {
    const { container } = render(
      <div>
        <TelegramIcon />
        <TelegramIcon />
      </div>,
    )
    const ids = Array.from(container.querySelectorAll('linearGradient')).map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('repassa props extras (ex. className) pro <svg>', () => {
    const { container } = render(<TelegramIcon className="h-4 w-4" />)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('h-4')
  })
})
