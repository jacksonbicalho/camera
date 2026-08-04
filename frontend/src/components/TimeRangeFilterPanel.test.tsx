import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import TimeRangeFilterPanel from './TimeRangeFilterPanel'

afterEach(() => {
  cleanup()
})

function trigger(side: 'from' | 'to', field: 'hour' | 'minute') {
  return document.getElementById(`history-time-range-${side}-${field}`) as HTMLButtonElement
}

function panel(side: 'from' | 'to', field: 'hour' | 'minute') {
  return document.getElementById(`history-time-range-${side}-${field}-list`)
}

function openDropdown(side: 'from' | 'to', field: 'hour' | 'minute') {
  fireEvent.click(trigger(side, field))
}

// selectOption — abre o dropdown (hora ou minuto) do lado indicado e clica na opção. `value
// = null` clica na opção "--" (limpar).
function selectOption(side: 'from' | 'to', field: 'hour' | 'minute', value: number | null) {
  openDropdown(side, field)
  const list = panel(side, field)!
  const selector = value === null ? '[data-value="clear"]' : `[data-value="${value}"]`
  fireEvent.click(list.querySelector(selector)!)
}

describe('CA2: TimeRangeFilterPanel — hora/minuto próprios (sem MUI)', () => {
  describe('ids estáveis por elemento (De/Até) e container', () => {
    it('renderiza o container e os 4 gatilhos (hora/minuto de cada lado)', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      expect(document.getElementById('history-time-range-filter')).not.toBeNull()
      expect(document.getElementById('history-time-range-from')).not.toBeNull()
      expect(document.getElementById('history-time-range-to')).not.toBeNull()
      expect(trigger('from', 'hour')).not.toBeNull()
      expect(trigger('from', 'minute')).not.toBeNull()
      expect(trigger('to', 'hour')).not.toBeNull()
      expect(trigger('to', 'minute')).not.toBeNull()
    })

    it('não existe botão "Aplicar" — o filtro é ao vivo, sem confirmação', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      expect(document.getElementById('history-time-range-apply')).toBeNull()
    })

    it('gatilhos têm aria-label distinguindo De/Até (acessibilidade sem depender de label visível)', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      expect(trigger('from', 'hour').getAttribute('aria-label')).toContain('De')
      expect(trigger('to', 'hour').getAttribute('aria-label')).toContain('Até')
    })
  })

  describe('exibição do valor atual', () => {
    it('valor preenchido via prop aparece formatado com zero à esquerda (09, não 9)', () => {
      render(<TimeRangeFilterPanel from={{ hour: 9, minute: 5 }} to={null} onChange={vi.fn()} />)
      expect(trigger('from', 'hour').textContent).toBe('09')
      expect(trigger('from', 'minute').textContent).toBe('05')
    })

    it('sem valor (null), os gatilhos mostram "--"', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      expect(trigger('from', 'hour').textContent).toBe('--')
      expect(trigger('from', 'minute').textContent).toBe('--')
    })
  })

  describe('confirmar (commit) só quando o lado está completo', () => {
    it('selecionar só a hora (minuto ainda vazio) NÃO dispara onChange', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={null} to={null} onChange={onChange} />)
      selectOption('from', 'hour', 9)
      expect(onChange).not.toHaveBeenCalled()
    })

    it('selecionar hora e minuto dispara onChange com o ClockTime completo', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={null} to={null} onChange={onChange} />)
      selectOption('from', 'hour', 9)
      selectOption('from', 'minute', 30)
      expect(onChange).toHaveBeenCalledWith({ hour: 9, minute: 30 }, null)
    })

    it('limpar os dois campos de um lado já preenchido dispara onChange com null (lado aberto)', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={{ hour: 9, minute: 0 }} to={null} onChange={onChange} />)
      selectOption('from', 'hour', null)
      expect(onChange).not.toHaveBeenCalled() // só a hora limpa, minuto ainda em 0 — incompleto
      selectOption('from', 'minute', null)
      expect(onChange).toHaveBeenCalledWith(null, null)
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
    it('selecionar "De" com um horário depois de "Até" já preenchido abre o modal de conflito', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={null} to={{ hour: 10, minute: 0 }} onChange={onChange} />)
      selectOption('from', 'hour', 12)
      selectOption('from', 'minute', 0)
      expect(document.getElementById('confirm-dialog-confirm')).not.toBeNull()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('confirmar o conflito zera o lado oposto e aplica o novo valor', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={null} to={{ hour: 10, minute: 0 }} onChange={onChange} />)
      selectOption('from', 'hour', 12)
      selectOption('from', 'minute', 0)
      fireEvent.click(document.getElementById('confirm-dialog-confirm')!)
      expect(onChange).toHaveBeenCalledWith({ hour: 12, minute: 0 }, null)
    })

    it('cancelar o conflito não altera nada — o campo volta a refletir o valor anterior (prop)', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={null} to={{ hour: 10, minute: 0 }} onChange={onChange} />)
      selectOption('from', 'hour', 12)
      selectOption('from', 'minute', 0)
      fireEvent.click(document.getElementById('confirm-dialog-cancel')!)
      expect(onChange).not.toHaveBeenCalled()
      expect(document.getElementById('confirm-dialog-confirm')).toBeNull()
      expect(trigger('from', 'hour').textContent).toBe('--')
    })
  })
})

describe('CA4: campos de hora/minuto viram dropdown (clique abre lista, sem seta)', () => {
  describe('gatilho é um botão simples, sem seta/ícone de select', () => {
    it('gatilho é um <button>, não um <select> nativo', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      expect(trigger('from', 'hour').tagName).toBe('BUTTON')
    })

    it('gatilho não tem nenhum ícone/seta (sem <svg>)', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      expect(trigger('from', 'hour').querySelector('svg')).toBeNull()
    })
  })

  describe('clique abre a lista de opções; lista não existe antes/depois', () => {
    it('lista não existe antes do clique', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      expect(panel('from', 'hour')).toBeNull()
    })

    it('clicar no gatilho abre a lista com as opções (0–23 pra hora)', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      openDropdown('from', 'hour')
      const list = panel('from', 'hour')!
      expect(list).not.toBeNull()
      expect(list.querySelector('[data-value="0"]')).not.toBeNull()
      expect(list.querySelector('[data-value="23"]')).not.toBeNull()
      expect(list.querySelector('[data-value="24"]')).toBeNull()
    })

    it('a lista de minuto vai até 59', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      openDropdown('from', 'minute')
      const list = panel('from', 'minute')!
      expect(list.querySelector('[data-value="59"]')).not.toBeNull()
      expect(list.querySelector('[data-value="60"]')).toBeNull()
    })

    it('selecionar uma opção fecha a lista', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      selectOption('from', 'hour', 9)
      expect(panel('from', 'hour')).toBeNull()
    })

    it('clicar fora da lista aberta a fecha, sem selecionar nada', () => {
      const onChange = vi.fn()
      render(<TimeRangeFilterPanel from={null} to={null} onChange={onChange} />)
      openDropdown('from', 'hour')
      expect(panel('from', 'hour')).not.toBeNull()
      fireEvent.mouseDown(document.body)
      expect(panel('from', 'hour')).toBeNull()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('Escape fecha a lista aberta', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      openDropdown('from', 'hour')
      expect(panel('from', 'hour')).not.toBeNull()
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(panel('from', 'hour')).toBeNull()
    })
  })

  describe('painel de opções nunca vaza da viewport (clamp de posição)', () => {
    const originalInnerWidth = window.innerWidth
    const originalInnerHeight = window.innerHeight

    afterEach(() => {
      vi.restoreAllMocks()
      Object.defineProperty(window, 'innerWidth', {
        value: originalInnerWidth,
        configurable: true,
      })
      Object.defineProperty(window, 'innerHeight', {
        value: originalInnerHeight,
        configurable: true,
      })
    })

    it('gatilho perto da borda inferior-direita da viewport: o painel fica inteiramente dentro dela', () => {
      Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true })
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 280,
        left: 380,
        right: 420,
        bottom: 300,
        width: 40,
        height: 20,
        x: 380,
        y: 280,
        toJSON: () => ({}),
      })
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(56)
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(192)

      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      openDropdown('from', 'hour')
      const list = panel('from', 'hour')!
      const left = parseFloat(list.style.left)
      const top = parseFloat(list.style.top)
      expect(left).toBeGreaterThanOrEqual(0)
      expect(left + 56).toBeLessThanOrEqual(400)
      expect(top).toBeGreaterThanOrEqual(0)
      expect(top + 192).toBeLessThanOrEqual(300)
    })

    it('gatilho perto da borda superior-esquerda (0,0): o painel nunca fica com posição negativa', () => {
      Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true })
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 0,
        left: 0,
        right: 30,
        bottom: 10,
        width: 30,
        height: 10,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(56)
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(192)

      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      openDropdown('from', 'hour')
      const list = panel('from', 'hour')!
      expect(parseFloat(list.style.left)).toBeGreaterThanOrEqual(0)
      expect(parseFloat(list.style.top)).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('CA5: scrollbar estilizada, fecha ao rolar a página, digitação pula pro valor', () => {
  describe('scrollbar', () => {
    it('a lista tem a classe scrollbar-thin (mesmo padrão já usado em #history-recordings-groups)', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      openDropdown('from', 'hour')
      expect(panel('from', 'hour')!.className).toContain('scrollbar-thin')
    })
  })

  describe('fecha ao rolar a página — não fica "solto" do campo', () => {
    it('rolar a janela com o painel aberto fecha o painel', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      openDropdown('from', 'hour')
      expect(panel('from', 'hour')).not.toBeNull()
      fireEvent.scroll(window)
      expect(panel('from', 'hour')).toBeNull()
    })

    it('REGRESSÃO: rolar a lista de opções em si (ela é overflow-y-auto, 60 itens no minuto) NÃO fecha o painel — só a página fechá-lo faz sentido', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      openDropdown('from', 'minute')
      const list = panel('from', 'minute')!
      fireEvent.scroll(list)
      expect(panel('from', 'minute')).not.toBeNull()
    })
  })

  describe('REGRESSÃO: abrir o painel move o foco pra dentro dele', () => {
    it('sem isso, o gatilho (irmão do painel portalado, não ancestral) fica com o foco e nenhuma tecla alcança o type-ahead', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      openDropdown('from', 'hour')
      const list = panel('from', 'hour')!
      expect(list.contains(document.activeElement)).toBe(true)
    })

    it('com um valor já selecionado, o foco vai pra essa opção (não pra primeira da lista)', () => {
      render(<TimeRangeFilterPanel from={{ hour: 9, minute: 0 }} to={null} onChange={vi.fn()} />)
      openDropdown('from', 'hour')
      const list = panel('from', 'hour')!
      expect(document.activeElement).toBe(list.querySelector('[data-value="9"]'))
    })

    it('REGRESSÃO: o foco usa preventScroll — focar a opção nunca deve, por si só, mover a página', () => {
      const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      openDropdown('from', 'hour')
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
      focusSpy.mockRestore()
    })

    it('REGRESSÃO: o painel já está posicionado (position:fixed) no momento em que a opção recebe foco — no 1º clique de cada campo, focar um elemento AINDA em fluxo normal (sem position:fixed ainda aplicado) fazia a página inteira rolar até ele', () => {
      let positionAtFocusTime: string | undefined
      const realFocus = HTMLElement.prototype.focus
      const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
        this: HTMLElement,
        options?: FocusOptions,
      ) {
        if (positionAtFocusTime === undefined) {
          positionAtFocusTime = panel('from', 'hour')?.style.position
        }
        realFocus.call(this, options)
      })
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      // Primeiro clique deste campo específico — exatamente o cenário relatado (style ainda
      // no valor inicial `{}` antes deste ciclo de abertura).
      openDropdown('from', 'hour')
      expect(positionAtFocusTime).toBe('fixed')
      focusSpy.mockRestore()
    })
  })

  describe('digitação pula pra opção correspondente (type-ahead)', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('digitar um único dígito leva o foco pra opção correspondente', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      openDropdown('from', 'hour')
      const list = panel('from', 'hour')!
      fireEvent.keyDown(list, { key: '5' })
      expect(document.activeElement).toBe(list.querySelector('[data-value="5"]'))
    })

    it('digitar dois dígitos em sequência rápida pula pro valor combinado (ex.: "1" + "4" → 14)', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      openDropdown('from', 'hour')
      const list = panel('from', 'hour')!
      fireEvent.keyDown(list, { key: '1' })
      fireEvent.keyDown(list, { key: '4' })
      expect(document.activeElement).toBe(list.querySelector('[data-value="14"]'))
    })

    it('depois de uma pausa, o buffer reseta — dígito seguinte busca a partir do zero', () => {
      vi.useFakeTimers()
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      openDropdown('from', 'minute')
      const list = panel('from', 'minute')!
      fireEvent.keyDown(list, { key: '1' })
      vi.advanceTimersByTime(700)
      fireEvent.keyDown(list, { key: '4' })
      expect(document.activeElement).toBe(list.querySelector('[data-value="4"]'))
    })

    it('combinação de dois dígitos sem opção correspondente (ex. "9"+"9"=99, hora só vai até 23) cai de volta pro último dígito digitado', () => {
      render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
      openDropdown('from', 'hour')
      const list = panel('from', 'hour')!
      fireEvent.keyDown(list, { key: '9' })
      expect(() => fireEvent.keyDown(list, { key: '9' })).not.toThrow()
      // "99" não existe (hora vai só até 23) — cai de volta pro último dígito sozinho ("9",
      // que existe: valor 9) em vez de não fazer nada.
      expect(document.activeElement).toBe(list.querySelector('[data-value="9"]'))
      expect(panel('from', 'hour')).not.toBeNull()
    })
  })
})

describe('CA6: Tab/Shift+Tab navegam entre os 4 campos, mesmo com um painel aberto', () => {
  it('Tab a partir do painel de "De — hora" fecha o painel e foca o gatilho de "De — minuto"', () => {
    render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
    openDropdown('from', 'hour')
    const list = panel('from', 'hour')!
    const result = fireEvent.keyDown(list, { key: 'Tab' })
    expect(result).toBe(false) // preventDefault chamado — navegação manual, não a nativa
    expect(panel('from', 'hour')).toBeNull()
    expect(document.activeElement).toBe(trigger('from', 'minute'))
  })

  it('Tab a partir do painel de "De — minuto" cruza pro gatilho de "Até — hora" (próximo lado)', () => {
    render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
    openDropdown('from', 'minute')
    const list = panel('from', 'minute')!
    fireEvent.keyDown(list, { key: 'Tab' })
    expect(panel('from', 'minute')).toBeNull()
    expect(document.activeElement).toBe(trigger('to', 'hour'))
  })

  it('Shift+Tab a partir do painel de "Até — minuto" volta pro gatilho de "Até — hora"', () => {
    render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
    openDropdown('to', 'minute')
    const list = panel('to', 'minute')!
    const result = fireEvent.keyDown(list, { key: 'Tab', shiftKey: true })
    expect(result).toBe(false)
    expect(panel('to', 'minute')).toBeNull()
    expect(document.activeElement).toBe(trigger('to', 'hour'))
  })

  it('Shift+Tab a partir do painel de "De — hora" (1º campo) NÃO trava a lógica manual — só fecha o painel e deixa o Tab nativo seguir', () => {
    render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
    openDropdown('from', 'hour')
    const list = panel('from', 'hour')!
    const result = fireEvent.keyDown(list, { key: 'Tab', shiftKey: true })
    expect(result).toBe(true) // preventDefault NÃO chamado — sem gatilho anterior, é a borda
    expect(panel('from', 'hour')).toBeNull()
  })

  it('Tab a partir do painel de "Até — minuto" (último campo) NÃO trava a lógica manual — só fecha o painel e deixa o Tab nativo seguir', () => {
    render(<TimeRangeFilterPanel from={null} to={null} onChange={vi.fn()} />)
    openDropdown('to', 'minute')
    const list = panel('to', 'minute')!
    const result = fireEvent.keyDown(list, { key: 'Tab' })
    expect(result).toBe(true)
    expect(panel('to', 'minute')).toBeNull()
  })
})
