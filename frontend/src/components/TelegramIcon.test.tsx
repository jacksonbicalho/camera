import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { TelegramIcon } from './TelegramIcon'
import { siTelegram } from 'simple-icons'

afterEach(cleanup)

describe('CA8: TelegramIcon — logo de marca real (simple-icons), não um path fabricado', () => {
  it('renderiza um <svg> cujo <path> usa exatamente siTelegram.path', () => {
    const { container } = render(<TelegramIcon />)
    const svg = container.querySelector('svg')
    const path = container.querySelector('path')
    expect(svg).toBeTruthy()
    expect(path).toBeTruthy()
    expect(path?.getAttribute('d')).toBe(siTelegram.path)
  })

  it('repassa props extras (ex. className) pro <svg>', () => {
    const { container } = render(<TelegramIcon className="h-4 w-4" />)
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('h-4')
  })
})
