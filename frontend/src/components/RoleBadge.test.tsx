import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import RoleBadge from './RoleBadge'

afterEach(cleanup)

describe('CA2: RoleBadge migrado para o componente Badge', () => {
  it('role admin usa a variante azul (info)', () => {
    render(<RoleBadge role="admin" />)
    const el = screen.getByText('admin')
    expect(el.className).toContain('blue')
  })

  it('role viewer usa a variante neutra', () => {
    render(<RoleBadge role="viewer" />)
    const el = screen.getByText('viewer')
    expect(el.className).not.toContain('blue')
  })
})
