import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CameraSettingsTabs from './CameraSettingsTabs'

afterEach(cleanup)

describe('CameraSettingsTabs', () => {
  describe('CA3: não renderiza mais breadcrumb próprio — só as abas', () => {
    it('sem nav de breadcrumb; abas presentes', () => {
      render(
        <MemoryRouter>
          <CameraSettingsTabs id="cam-1" active="zones" />
        </MemoryRouter>,
      )
      expect(screen.queryByRole('navigation')).toBeNull()
      expect(screen.queryByText('Câmeras')).toBeNull()
      expect(screen.getByText('Zonas')).toBeTruthy()
    })
  })

  // CA8 (história refactor/camera-tabs-para-sidebar-ia): Análise e Estados
  // saem da página de câmera — passam a viver em Inteligência Artificial
  // (/settings/analyses, /settings/states), escolhendo a câmera lá dentro em
  // vez de navegar câmera-primeiro. Só Câmera/Zonas continuam aqui. Análise
  // de objetos e Estados foram removidos do produto depois (histórias
  // chore/remover-classificacao-estados-* e chore/remover-analise-objetos).
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

  describe('CA9: o botão "+ Nova câmera" não vive mais aqui — migrou pro PageHeader de cada página (mesma posição/estilo da lista)', () => {
    it('CameraSettingsTabs não renderiza nenhum botão "Nova câmera"', () => {
      render(
        <MemoryRouter>
          <CameraSettingsTabs id="cam-1" active="zones" />
        </MemoryRouter>,
      )
      expect(screen.queryByText('Nova câmera')).toBeNull()
    })
  })
})
