import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import TimeRangeFilterPanel from './TimeRangeFilterPanel'

afterEach(() => {
  cleanup()
})

describe('TimeRangeFilterPanel', () => {
  describe('CA4: ids estáveis por elemento (De/Até) e container', () => {
    it('renderiza os ids interativos + o container', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      expect(document.getElementById('history-time-range-filter')).not.toBeNull()
      expect(document.getElementById('history-time-range-from')).not.toBeNull()
      expect(document.getElementById('history-time-range-to')).not.toBeNull()
    })

    it('não existe mais botão "Aplicar" — o filtro é ao vivo, sem confirmação', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      expect(document.getElementById('history-time-range-apply')).toBeNull()
    })
  })
})
