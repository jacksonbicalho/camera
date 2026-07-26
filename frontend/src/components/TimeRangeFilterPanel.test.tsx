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

  describe('CA4: altura/fonte batem com as outras 2 linhas da coluna (h-8/32px, text-caption/12px)', () => {
    it('o PICKER_SX é de fato aplicado ao nó real do MUI X (getComputedStyle, não só presença de classe) — trava a regressão de usar um seletor CSS que não existe nesse DOM (o próprio bug corrigido nesta iteração: `.MuiInputBase-root`/`.MuiOutlinedInput-notchedOutline`, do TextField comum do @mui/material, não batem com a "accessible field DOM structure" que TimePicker/DatePicker usam desde o MUI X v7 — sx virava no-op silencioso, sem erro em lint/build)', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      const from = document.getElementById('history-time-range-from')!
      const root = from.closest('.MuiPickersInputBase-root') as HTMLElement
      expect(root).not.toBeNull()
      const computed = getComputedStyle(root)
      expect(computed.height).toBe('32px')
      expect(computed.fontSize).toBe('12px')
    })
  })
})
