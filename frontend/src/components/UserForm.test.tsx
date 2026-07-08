import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import UserForm from './UserForm'

afterEach(() => {
  cleanup()
})

describe('UserForm — e-mail e nome', () => {
  it('renders email and name fields', () => {
    render(
      <UserForm cameras={[]} onSave={vi.fn()} onCancel={vi.fn()} saving={false} />,
    )
    expect(screen.getByLabelText(/e-mail/i)).toBeInstanceOf(HTMLInputElement)
    expect(screen.getByLabelText(/^nome$/i)).toBeInstanceOf(HTMLInputElement)
  })

  it('submits email and name in the form data', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <UserForm cameras={[]} onSave={onSave} onCancel={vi.fn()} saving={false} />,
    )

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'newuser' } })
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: 'New User' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', name: 'New User' }),
    )
  })

  it('pre-fills email and name when editing an existing user', () => {
    render(
      <UserForm
        cameras={[]}
        initial={{ id: 1, username: 'alice', role: 'viewer', cameras: [], email: 'alice@example.com', name: 'Alice' }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        saving={false}
      />,
    )
    expect((screen.getByLabelText(/e-mail/i) as HTMLInputElement).value).toBe('alice@example.com')
    expect((screen.getByLabelText(/^nome$/i) as HTMLInputElement).value).toBe('Alice')
  })
})

describe('UserForm — troca de senha na edição', () => {
  const alice = { id: 1, username: 'alice', role: 'viewer' as const, cameras: [], email: 'alice@example.com', name: 'Alice' }

  it('mostra o campo Senha também ao editar, opcional (sem required)', () => {
    render(
      <UserForm cameras={[]} initial={alice} onSave={vi.fn()} onCancel={vi.fn()} saving={false} />,
    )
    const senha = screen.getByLabelText(/senha/i) as HTMLInputElement
    expect(senha).toBeInstanceOf(HTMLInputElement)
    expect(senha.required).toBe(false)
  })

  it('editar sem preencher a senha envia password vazio (backend não mexe na senha)', () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <UserForm cameras={[]} initial={alice} onSave={onSave} onCancel={vi.fn()} saving={false} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ password: '' }))
  })

  it('editar preenchendo a senha envia o novo valor', () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <UserForm cameras={[]} initial={alice} onSave={onSave} onCancel={vi.fn()} saving={false} />,
    )
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: 'novaSenha123' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ password: 'novaSenha123' }))
  })

  it('campo Senha é obrigatório ao criar (sem initial)', () => {
    render(
      <UserForm cameras={[]} onSave={vi.fn()} onCancel={vi.fn()} saving={false} />,
    )
    expect((screen.getByLabelText(/senha/i) as HTMLInputElement).required).toBe(true)
  })

  it('não existe mais o botão "Alterar senha"', () => {
    render(
      <UserForm cameras={[]} initial={alice} onSave={vi.fn()} onCancel={vi.fn()} saving={false} />,
    )
    expect(screen.queryByRole('button', { name: /alterar senha/i })).toBeNull()
  })
})
