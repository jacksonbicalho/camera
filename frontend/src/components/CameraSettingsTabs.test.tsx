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
      expect(screen.getByText('Nova câmera')).toBeTruthy()
    })
  })

  // CA8 (história refactor/camera-tabs-para-sidebar-ia): Análise e Estados
  // saem da página de câmera — passam a viver em Inteligência Artificial
  // (/settings/analyses, /settings/states), escolhendo a câmera lá dentro em
  // vez de navegar câmera-primeiro. Só Câmera/Zonas continuam aqui. Análise
  // voltou pra cá depois (história refactor/mover-analise-para-cadastro-camera)
  // — não como aba, vira sessão (CameraAnalysisSection) dentro da própria
  // aba Câmera; Estados continua IA-primeiro, sem mudança.
  //
  // CA5 (história feat/camera-form-reshape, T4): "Detecção de movimento" deixa
  // de ser aba própria — vira sessão dentro de /settings/cameras/:id.
  describe('CA8: só 2 abas — Análise e Estados saem daqui (viram links em Inteligência Artificial); Movimento vira sessão', () => {
    it('não renderiza mais "Análise", "Estados" nem "Detecção de movimento" como aba', () => {
      render(
        <MemoryRouter>
          <CameraSettingsTabs id="cam-1" active="zones" />
        </MemoryRouter>,
      )
      expect(screen.getByText('Câmera')).toBeTruthy()
      expect(screen.getByText('Zonas')).toBeTruthy()
      expect(screen.queryByText('Análise')).toBeNull()
      expect(screen.queryByText('Estados')).toBeNull()
      expect(screen.queryByText('Detecção de movimento')).toBeNull()
    })
  })

  describe('CA7: o botão "+ Nova câmera" assenta na mesma linha de base das abas, sem sobrepor a borda inferior', () => {
    it('o container da linha usa items-end (alinhamento pela base) em vez de mb-1 no botão', () => {
      render(
        <MemoryRouter>
          <CameraSettingsTabs id="cam-1" active="zones" />
        </MemoryRouter>,
      )
      const row = screen.getByText('Zonas').closest('.border-b')
      expect(row?.className).toContain('items-end')
      const button = screen.getByText('Nova câmera').closest('a')
      expect(button?.className ?? '').not.toContain('mb-1')
    })
  })
})
