import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import CameraAnalysisSection from './CameraAnalysisSection'

vi.mock('../auth', () => ({ authHeaders: () => ({}) }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('/analysis'))
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ enabled: false, detector_id: null, confidence_threshold: 0.4 }),
        })
      if (url.includes('/detectors'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
    }),
  )
}

describe('CA8: o botão de Detector de objetos fica alinhado à esquerda e rotulado "Aplicar", mesmo padrão das demais sessões', () => {
  it('rótulo do botão é "Aplicar", não "Salvar"', async () => {
    stubFetch()
    render(<CameraAnalysisSection id="cam-1" />)
    await waitFor(() => {
      expect(document.getElementById('camera-analysis-save')?.textContent).toBe('Aplicar')
    })
  })

  it('o botão fica à esquerda (mesmo padrão de gap do Motion, não justify-between)', async () => {
    stubFetch()
    render(<CameraAnalysisSection id="cam-1" />)
    await waitFor(() => {
      const footer = document.getElementById('camera-analysis-save')?.parentElement
      expect(footer?.className).not.toContain('justify-between')
    })
  })
})

// O tamanho "sm" (h-8) do botão "Aplicar" não é mais um teste de consistência
// cross-file (comparando o className deste componente contra os demais) —
// virou garantido por construção: todos usam o mesmo ApplyButton
// (components/ui/apply-button.tsx, default size="sm"), testado uma única vez
// em apply-button.test.tsx.
