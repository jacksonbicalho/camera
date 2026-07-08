import { describe, expect, it } from 'vitest'
import { postChangeRedirect } from './changePasswordRedirect'

describe('postChangeRedirect', () => {
  it('admin sem câmeras vai para o cadastro de câmera', () => {
    expect(postChangeRedirect({ adminWithNoCameras: true })).toBe('/settings/cameras/new')
  })

  it('caso geral vai para a home', () => {
    expect(postChangeRedirect({ adminWithNoCameras: false })).toBe('/')
  })
})
