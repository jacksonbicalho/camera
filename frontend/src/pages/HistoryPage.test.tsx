import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import HistoryPage from './HistoryPage'

afterEach(cleanup)

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/history/:cameraId" element={<HistoryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('HistoryPage', () => {
  it('header "Histórico" + tabs (Ao vivo → /live) + grid estático de cards', () => {
    renderAt('/history/cam1')
    expect(document.getElementById('history-header')?.textContent).toContain('Histórico')
    expect(document.getElementById('camera-tab-live')?.getAttribute('href')).toBe('/live/cam1')
    const grid = document.getElementById('history-grid')!
    expect(grid).toBeTruthy()
    expect(document.getElementById('history-card-0')).toBeTruthy()
    // vários cards estáticos
    expect(grid.querySelectorAll('[id^="history-card-"]').length).toBeGreaterThan(1)
  })
})
