import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Badge } from './badge'

afterEach(cleanup)

describe('CA2: Badge (shadcn/ui)', () => {
  it('renderiza o texto e a variante default (neutral)', () => {
    render(<Badge>Rótulo</Badge>)
    const el = screen.getByText('Rótulo')
    expect(el).toBeTruthy()
    expect(el.className).toContain('border')
  })

  it('aplica a variante success (verde)', () => {
    render(<Badge variant="success">Detecção</Badge>)
    expect(screen.getByText('Detecção').className).toContain('green')
  })

  it('aplica a variante info (azul)', () => {
    render(<Badge variant="info">ONVIF</Badge>)
    expect(screen.getByText('ONVIF').className).toContain('blue')
  })

  it('aplica a variante danger (vermelho)', () => {
    render(<Badge variant="danger">Gravando</Badge>)
    expect(screen.getByText('Gravando').className).toContain('red')
  })
})
