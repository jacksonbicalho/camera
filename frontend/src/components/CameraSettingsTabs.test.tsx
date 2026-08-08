import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CameraSettingsTabs from './CameraSettingsTabs'

vi.mock('../auth', () => ({
  getRole: () => 'admin',
}))

afterEach(cleanup)

describe('CameraSettingsTabs', () => {
  describe('CA3: não renderiza mais breadcrumb próprio — só abas e o botão "Nova câmera"', () => {
    it('sem nav de breadcrumb; abas e botão "Nova câmera" presentes', () => {
      render(
        <MemoryRouter>
          <CameraSettingsTabs id="cam-1" active="zones" />
        </MemoryRouter>,
      )
      expect(screen.queryByRole('navigation')).toBeNull()
      expect(screen.queryByText('Câmeras')).toBeNull()
      expect(screen.getByText('Zonas')).toBeTruthy()
      expect(screen.getByText('Detecção de movimento')).toBeTruthy()
      expect(screen.getByText('Nova câmera')).toBeTruthy()
    })
  })

  // CA8 (história refactor/camera-tabs-para-sidebar-ia): Análise e Estados
  // saem da página de câmera — passam a viver em Inteligência Artificial
  // (/settings/analyses, /settings/states), escolhendo a câmera lá dentro em
  // vez de navegar câmera-primeiro. Só Câmera/Movimento/Zonas continuam aqui.
  describe('CA8: só 3 abas — Análise e Estados saem daqui (viram links em Inteligência Artificial)', () => {
    it('não renderiza mais "Análise" nem "Estados"', () => {
      render(
        <MemoryRouter>
          <CameraSettingsTabs id="cam-1" active="zones" />
        </MemoryRouter>,
      )
      expect(screen.getByText('Câmera')).toBeTruthy()
      expect(screen.getByText('Detecção de movimento')).toBeTruthy()
      expect(screen.getByText('Zonas')).toBeTruthy()
      expect(screen.queryByText('Análise')).toBeNull()
      expect(screen.queryByText('Estados')).toBeNull()
    })
  })
})
