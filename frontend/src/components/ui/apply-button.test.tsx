import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ApplyButton } from './apply-button'

afterEach(cleanup)

describe('CA3: ApplyButton (components/ui) alterna "Aplicar"/"Aplicando..." conforme saving e fica desabilitado durante o save', () => {
  it('mostra "Aplicar" e fica habilitado quando saving=false e disabled não é passado', () => {
    render(<ApplyButton id="x-save" saving={false} />)

    const btn = screen.getByRole('button', { name: /aplicar/i }) as HTMLButtonElement
    expect(btn.textContent).toBe('Aplicar')
    expect(btn.disabled).toBe(false)
  })

  it('mostra "Aplicando..." e fica desabilitado quando saving=true', () => {
    render(<ApplyButton id="x-save" saving={true} />)

    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(btn.textContent).toBe('Aplicando...')
    expect(btn.disabled).toBe(true)
  })

  it('fica desabilitado quando disabled=true mesmo com saving=false (ex.: sem alterações)', () => {
    render(<ApplyButton id="x-save" saving={false} disabled />)

    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('type="button" chama onClick (uso fora de <form>, ex. cards de extensão)', () => {
    const onClick = vi.fn()
    render(<ApplyButton id="x-save" saving={false} type="button" onClick={onClick} />)

    fireEvent.click(screen.getByRole('button'))

    expect(onClick).toHaveBeenCalled()
  })

  it('usa size="sm" (h-8) por padrão, mesmo tamanho em todo consumidor que não passa size', () => {
    render(<ApplyButton id="x-save" saving={false} />)

    expect(screen.getByRole('button').className).toContain('h-8')
  })

  it('size="default" (h-9) quando o consumidor passa explicitamente (ex.: cards de extensão)', () => {
    render(<ApplyButton id="x-save" saving={false} size="default" />)

    expect(screen.getByRole('button').className).toContain('h-9')
  })
})
