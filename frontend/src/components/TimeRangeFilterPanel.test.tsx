import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import TimeRangeFilterPanel from './TimeRangeFilterPanel'

afterEach(() => {
  cleanup()
})

function hourInput(side: 'from' | 'to') {
  return document.getElementById(`history-time-range-${side}-hour`) as HTMLInputElement
}
function minuteInput(side: 'from' | 'to') {
  return document.getElementById(`history-time-range-${side}-minute`) as HTMLInputElement
}

// fillAndBlur — digita hora/minuto no lado indicado e sai do campo de minuto (dispara o
// commit, mesmo espírito do onAccept que o MUI TimePicker antigo só disparava no fim da
// seleção completa).
function fillAndBlur(side: 'from' | 'to', hour: string, minute: string) {
  fireEvent.change(hourInput(side), { target: { value: hour } })
  fireEvent.blur(hourInput(side))
  fireEvent.change(minuteInput(side), { target: { value: minute } })
  fireEvent.blur(minuteInput(side))
}

describe('CA2: TimeRangeFilterPanel — input próprio de hora/minuto (sem MUI)', () => {
  describe('ids estáveis por elemento (De/Até) e container', () => {
    it('renderiza o container e os 4 inputs (hora/minuto de cada lado)', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      expect(document.getElementById('history-time-range-filter')).not.toBeNull()
      expect(document.getElementById('history-time-range-from')).not.toBeNull()
      expect(document.getElementById('history-time-range-to')).not.toBeNull()
      expect(hourInput('from')).not.toBeNull()
      expect(minuteInput('from')).not.toBeNull()
      expect(hourInput('to')).not.toBeNull()
      expect(minuteInput('to')).not.toBeNull()
    })

    it('não existe botão "Aplicar" — o filtro é ao vivo, sem confirmação', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      expect(document.getElementById('history-time-range-apply')).toBeNull()
    })

    it('inputs têm aria-label distinguindo De/Até (acessibilidade sem depender de label visível)', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      expect(hourInput('from').getAttribute('aria-label')).toContain('De')
      expect(hourInput('to').getAttribute('aria-label')).toContain('Até')
    })
  })

  describe('exibição do valor atual', () => {
    it('valor preenchido via prop aparece formatado com zero à esquerda (09, não 9)', () => {
      render(<TimeRangeFilterPanel from={{ hour: 9, minute: 5 }} to={null} onChange={vi.fn()} />)
      expect(hourInput('from').value).toBe('09')
      expect(minuteInput('from').value).toBe('05')
    })

    it('sem valor (null), os inputs começam vazios', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      expect(hourInput('from').value).toBe('')
      expect(minuteInput('from').value).toBe('')
    })
  })

  describe('confirmar (commit) só quando o lado está completo', () => {
    it('preencher só a hora (minuto ainda vazio) e sair do campo NÃO dispara onChange', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={null} to={null} onChange={onChange} />)
      fireEvent.change(hourInput('from'), { target: { value: '9' } })
      fireEvent.blur(hourInput('from'))
      expect(onChange).not.toHaveBeenCalled()
    })

    it('preencher hora e minuto (sair do campo de minuto) dispara onChange com o ClockTime completo', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={null} to={null} onChange={onChange} />)
      fillAndBlur('from', '9', '30')
      expect(onChange).toHaveBeenCalledWith({ hour: 9, minute: 30 }, null)
    })

    it('limpar os dois campos de um lado já preenchido dispara onChange com null (lado aberto)', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={{ hour: 9, minute: 0 }} to={null} onChange={onChange} />)
      fireEvent.change(hourInput('from'), { target: { value: '' } })
      fireEvent.blur(hourInput('from'))
      fireEvent.change(minuteInput('from'), { target: { value: '' } })
      fireEvent.blur(minuteInput('from'))
      expect(onChange).toHaveBeenCalledWith(null, null)
    })
  })

  describe('clamp de valores fora do intervalo ao perder foco', () => {
    it('hora acima de 23 é limitada a 23', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={null} to={null} onChange={onChange} />)
      fillAndBlur('from', '99', '0')
      expect(hourInput('from').value).toBe('23')
      expect(onChange).toHaveBeenCalledWith({ hour: 23, minute: 0 }, null)
    })

    it('minuto acima de 59 é limitado a 59', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={null} to={null} onChange={onChange} />)
      fillAndBlur('from', '10', '99')
      expect(minuteInput('from').value).toBe('59')
      expect(onChange).toHaveBeenCalledWith({ hour: 10, minute: 59 }, null)
    })

    it('valor fora do intervalo digitado no campo IRMÃO (sem sair dele) ainda é clampado ao confirmar pelo outro campo', () => {
      // Digita "99" no minuto sem sair do campo (sem blur nele), depois preenche e sai da
      // hora — o commit é disparado pelo blur da hora, mas precisa clampar o minuto também
      // (ele nunca passou pelo próprio onBlur).
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={null} to={null} onChange={onChange} />)
      fireEvent.change(minuteInput('from'), { target: { value: '99' } })
      fireEvent.change(hourInput('from'), { target: { value: '10' } })
      fireEvent.blur(hourInput('from'))
      expect(onChange).toHaveBeenCalledWith({ hour: 10, minute: 59 }, null)
    })
  })

  describe('digita só dígitos — letras/símbolos são descartados', () => {
    it('digitar caracteres não-numéricos não aparece no campo', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      fireEvent.change(hourInput('from'), { target: { value: 'ab1c2d' } })
      expect(hourInput('from').value).toBe('12')
    })
  })

  describe('não dispara onChange quando o valor confirmado é igual ao já commitado (ex.: Tab sem editar)', () => {
    it('sair do campo sem alterar o valor não chama onChange de novo', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={{ hour: 9, minute: 30 }} to={null} onChange={onChange} />)
      fireEvent.blur(hourInput('from'))
      fireEvent.blur(minuteInput('from'))
      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('sem conflito de horário, nenhum modal é renderizado', () => {
    it('sem from/to, ConfirmDialog não existe no DOM', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      expect(document.getElementById('confirm-dialog-confirm')).toBeNull()
      expect(document.getElementById('confirm-dialog-cancel')).toBeNull()
    })

    it('com from e to já preenchidos em ordem válida, ConfirmDialog não existe no DOM', () => {
      render(
        <TimeRangeFilterPanel
          from={{ hour: 9, minute: 0 }}
          to={{ hour: 17, minute: 0 }}
          onChange={vi.fn()}
        />,
      )
      expect(document.getElementById('confirm-dialog-confirm')).toBeNull()
    })
  })

  describe('conflito de horário (De > Até) abre o ConfirmDialog, mesmo comportamento de sempre', () => {
    it('preencher "De" com um horário depois de "Até" já preenchido abre o modal de conflito', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={null} to={{ hour: 10, minute: 0 }} onChange={onChange} />)
      fillAndBlur('from', '12', '0')
      expect(document.getElementById('confirm-dialog-confirm')).not.toBeNull()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('confirmar o conflito zera o lado oposto e aplica o novo valor', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={null} to={{ hour: 10, minute: 0 }} onChange={onChange} />)
      fillAndBlur('from', '12', '0')
      fireEvent.click(document.getElementById('confirm-dialog-confirm')!)
      expect(onChange).toHaveBeenCalledWith({ hour: 12, minute: 0 }, null)
    })

    it('cancelar o conflito não altera nada — o campo volta a refletir o valor anterior (prop)', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={null} to={{ hour: 10, minute: 0 }} onChange={onChange} />)
      fillAndBlur('from', '12', '0')
      fireEvent.click(document.getElementById('confirm-dialog-cancel')!)
      expect(onChange).not.toHaveBeenCalled()
      expect(document.getElementById('confirm-dialog-confirm')).toBeNull()
      expect(hourInput('from').value).toBe('')
    })
  })
})
