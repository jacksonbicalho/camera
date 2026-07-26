import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import TimeRangeFilterPanel from './TimeRangeFilterPanel'
import type { ClockTime } from '../lib/timeRange'

afterEach(() => {
  cleanup()
})

describe('TimeRangeFilterPanel', () => {
  describe('CA4: ids estáveis por elemento (De/Até/Aplicar) e container', () => {
    it('renderiza os 3 ids interativos + o container', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} onApply={vi.fn()} />)
      expect(document.getElementById('history-time-range-filter')).not.toBeNull()
      expect(document.getElementById('history-time-range-from')).not.toBeNull()
      expect(document.getElementById('history-time-range-to')).not.toBeNull()
      expect(document.getElementById('history-time-range-apply')).not.toBeNull()
    })
  })

  describe('CA4: "Aplicar" só fica habilitado quando os dois horários (De e Até) estão preenchidos', () => {
    it('sem from nem to, o botão Aplicar fica desabilitado', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} onApply={vi.fn()} />)
      const apply = document.getElementById('history-time-range-apply') as HTMLButtonElement
      expect(apply.disabled).toBe(true)
    })

    it('só com "from" preenchido, o botão Aplicar continua desabilitado', () => {
      const from: ClockTime = { hour: 9, minute: 0 }
      render(<TimeRangeFilterPanel from={from} to={null} onChange={vi.fn()} onApply={vi.fn()} />)
      const apply = document.getElementById('history-time-range-apply') as HTMLButtonElement
      expect(apply.disabled).toBe(true)
    })

    it('com os dois horários preenchidos, o botão Aplicar fica habilitado e chama onApply ao clicar', () => {
      const from: ClockTime = { hour: 9, minute: 0 }
      const to: ClockTime = { hour: 17, minute: 30 }
      const onApply = vi.fn()
      render(<TimeRangeFilterPanel from={from} to={to} onChange={vi.fn()} onApply={onApply} />)
      const apply = document.getElementById('history-time-range-apply') as HTMLButtonElement
      expect(apply.disabled).toBe(false)
      fireEvent.click(apply)
      expect(onApply).toHaveBeenCalledWith(from, to)
    })
  })
})
