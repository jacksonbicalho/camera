import { describe, expect, it } from 'vitest'
import { afterEach } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useDraggableResizable } from './useDraggableResizable'

afterEach(cleanup)

interface HarnessProps {
  aspectRatio?: number
  initialWidth?: number
  minWidth?: number
  maxWidth?: number
  chromeHeight?: number
  resizable?: boolean
  lockAspectRatio?: boolean
  viewportMargin?: number
}

function Harness({
  aspectRatio = 16 / 9,
  initialWidth = 800,
  minWidth = 320,
  maxWidth,
  chromeHeight = 80,
  resizable,
  lockAspectRatio,
  viewportMargin,
}: HarnessProps) {
  const { style, dragHandleProps, resizeHandleProps } = useDraggableResizable({
    aspectRatio,
    initialWidth,
    minWidth,
    maxWidth,
    chromeHeight,
    resizable,
    lockAspectRatio,
    viewportMargin,
  })
  return (
    <div id="box" style={style}>
      <div id="handle" {...dragHandleProps} />
      {resizeHandleProps && (
        <>
          <div id="resize-handle-tl" {...resizeHandleProps.tl} />
          <div id="resize-handle-tr" {...resizeHandleProps.tr} />
          <div id="resize-handle-bl" {...resizeHandleProps.bl} />
          <div id="resize-handle-br" {...resizeHandleProps.br} />
        </>
      )}
    </div>
  )
}

describe('useDraggableResizable', () => {
  describe('CA2: redimensionar mantém a proporção do vídeo (altura sempre derivada da largura)', () => {
    it('altura inicial = largura / aspectRatio + chromeHeight', () => {
      render(<Harness initialWidth={800} aspectRatio={16 / 9} chromeHeight={80} />)
      const box = document.getElementById('box')!
      expect(box.style.width).toBe('800px')
      expect(box.style.height).toBe(`${800 / (16 / 9) + 80}px`)
    })

    it('arrastar a alça de resize muda a largura E recalcula a altura mantendo a proporção 16:9', () => {
      render(<Harness initialWidth={800} aspectRatio={16 / 9} chromeHeight={80} minWidth={320} />)
      const handle = document.getElementById('resize-handle-br')!
      fireEvent.pointerDown(handle, { clientX: 800, clientY: 450, pointerId: 1 })
      fireEvent.pointerMove(handle, { clientX: 900, clientY: 450, pointerId: 1 })
      fireEvent.pointerUp(handle, { clientX: 900, clientY: 450, pointerId: 1 })
      const box = document.getElementById('box')!
      expect(box.style.width).toBe('900px')
      expect(box.style.height).toBe(`${900 / (16 / 9) + 80}px`)
    })

    it('não redimensiona abaixo de minWidth', () => {
      render(<Harness initialWidth={400} aspectRatio={16 / 9} chromeHeight={80} minWidth={320} />)
      const handle = document.getElementById('resize-handle-br')!
      fireEvent.pointerDown(handle, { clientX: 400, clientY: 300, pointerId: 1 })
      fireEvent.pointerMove(handle, { clientX: 0, clientY: 300, pointerId: 1 })
      fireEvent.pointerUp(handle, { clientX: 0, clientY: 300, pointerId: 1 })
      expect(document.getElementById('box')!.style.width).toBe('320px')
    })

    it('não redimensiona acima de maxWidth', () => {
      render(<Harness initialWidth={400} aspectRatio={16 / 9} chromeHeight={80} maxWidth={500} />)
      const handle = document.getElementById('resize-handle-br')!
      fireEvent.pointerDown(handle, { clientX: 400, clientY: 300, pointerId: 1 })
      fireEvent.pointerMove(handle, { clientX: 2000, clientY: 300, pointerId: 1 })
      fireEvent.pointerUp(handle, { clientX: 2000, clientY: 300, pointerId: 1 })
      expect(document.getElementById('box')!.style.width).toBe('500px')
    })
  })

  describe('CA2: arrastar pelo cabeçalho move o modal (top/left)', () => {
    it('pointerdown+move+up no cabeçalho desloca a posição pela distância percorrida', () => {
      render(<Harness />)
      const box = document.getElementById('box')!
      const topBefore = parseFloat(box.style.top)
      const leftBefore = parseFloat(box.style.left)
      const handle = document.getElementById('handle')!
      fireEvent.pointerDown(handle, { clientX: 500, clientY: 300, pointerId: 1 })
      fireEvent.pointerMove(handle, { clientX: 560, clientY: 340, pointerId: 1 })
      fireEvent.pointerUp(handle, { clientX: 560, clientY: 340, pointerId: 1 })
      expect(parseFloat(box.style.left)).toBeCloseTo(leftBefore + 60)
      expect(parseFloat(box.style.top)).toBeCloseTo(topBefore + 40)
    })

    it('pointermove sem pointerdown antes não move nada (drag não iniciado)', () => {
      render(<Harness />)
      const box = document.getElementById('box')!
      const topBefore = box.style.top
      const leftBefore = box.style.left
      const handle = document.getElementById('handle')!
      fireEvent.pointerMove(handle, { clientX: 999, clientY: 999, pointerId: 1 })
      expect(box.style.top).toBe(topBefore)
      expect(box.style.left).toBe(leftBefore)
    })

    it('pointerup encerra o arraste — pointermove seguinte não move mais nada', () => {
      render(<Harness />)
      const box = document.getElementById('box')!
      const handle = document.getElementById('handle')!
      fireEvent.pointerDown(handle, { clientX: 500, clientY: 300, pointerId: 1 })
      fireEvent.pointerMove(handle, { clientX: 560, clientY: 340, pointerId: 1 })
      fireEvent.pointerUp(handle, { clientX: 560, clientY: 340, pointerId: 1 })
      const leftAfterFirstDrag = box.style.left
      fireEvent.pointerMove(handle, { clientX: 900, clientY: 900, pointerId: 1 })
      expect(box.style.left).toBe(leftAfterFirstDrag)
    })
  })

  describe('CA6: arrastar/redimensionar mantém a caixa inteira dentro da viewport (topo/base/esquerda/direita)', () => {
    it('arrastar bem pra baixo/direita trava exatamente na borda — a caixa inteira (não só uma margem) continua visível', () => {
      render(<Harness initialWidth={800} aspectRatio={16 / 9} chromeHeight={80} />)
      const box = document.getElementById('box')!
      const width = parseFloat(box.style.width)
      const height = parseFloat(box.style.height)
      const handle = document.getElementById('handle')!
      fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
      fireEvent.pointerMove(handle, { clientX: 100000, clientY: 100000, pointerId: 1 })
      fireEvent.pointerUp(handle, { clientX: 100000, clientY: 100000, pointerId: 1 })
      expect(parseFloat(box.style.left)).toBe(window.innerWidth - width)
      expect(parseFloat(box.style.top)).toBe(window.innerHeight - height)
    })

    it('arrastar bem pra cima/esquerda trava em 0 — nunca fica negativo (fora da viewport por cima/pela esquerda)', () => {
      render(<Harness />)
      const box = document.getElementById('box')!
      const handle = document.getElementById('handle')!
      fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
      fireEvent.pointerMove(handle, { clientX: -100000, clientY: -100000, pointerId: 1 })
      fireEvent.pointerUp(handle, { clientX: -100000, clientY: -100000, pointerId: 1 })
      expect(parseFloat(box.style.left)).toBe(0)
      expect(parseFloat(box.style.top)).toBe(0)
    })

    it('redimensionar depois de arrastar pro canto inferior direito não deixa a borda direita nem a de baixo saírem da viewport (clamp considera a posição atual, não só um teto fixo)', () => {
      render(<Harness initialWidth={300} aspectRatio={16 / 9} chromeHeight={80} minWidth={200} />)
      const box = document.getElementById('box')!
      const dragHandle = document.getElementById('handle')!
      fireEvent.pointerDown(dragHandle, { clientX: 0, clientY: 0, pointerId: 1 })
      fireEvent.pointerMove(dragHandle, { clientX: 100000, clientY: 100000, pointerId: 1 })
      fireEvent.pointerUp(dragHandle, { clientX: 100000, clientY: 100000, pointerId: 1 })
      const left = parseFloat(box.style.left)
      const top = parseFloat(box.style.top)

      const resizeHandle = document.getElementById('resize-handle-br')!
      const widthBefore = parseFloat(box.style.width)
      fireEvent.pointerDown(resizeHandle, { clientX: widthBefore, clientY: 0, pointerId: 1 })
      fireEvent.pointerMove(resizeHandle, {
        clientX: widthBefore + 100000,
        clientY: 0,
        pointerId: 1,
      })
      fireEvent.pointerUp(resizeHandle, { clientX: widthBefore + 100000, clientY: 0, pointerId: 1 })

      const widthAfter = parseFloat(box.style.width)
      const heightAfter = parseFloat(box.style.height)
      expect(left + widthAfter).toBeLessThanOrEqual(window.innerWidth)
      expect(top + heightAfter).toBeLessThanOrEqual(window.innerHeight)
    })
  })

  describe('CA9: depois de bater num limite, o cursor não "descola" do ponto agarrado — mover na direção oposta reage de imediato, sem zona morta', () => {
    it('arrastar (drag): depois do overshoot ser clampado, mover só um pouco na direção oposta já move a caixa (não precisa "descontar" a distância inteira do overshoot)', () => {
      render(<Harness initialWidth={800} aspectRatio={16 / 9} chromeHeight={80} />)
      const box = document.getElementById('box')!
      const handle = document.getElementById('handle')!
      // Overshoot GRANDE além do limite — com a âncora fixa (bug antigo), isso "banca" uma
      // diferença enorme entre o mouse e a caixa.
      fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
      fireEvent.pointerMove(handle, { clientX: 100000, clientY: 100000, pointerId: 1 })
      const leftClamped = parseFloat(box.style.left)
      const topClamped = parseFloat(box.style.top)
      // Move só 10px de volta — com âncora incremental (fix), a caixa responde IMEDIATAMENTE;
      // com âncora fixa (bug), nada se moveria (precisaria voltar ~99990px pra sair do clamp).
      fireEvent.pointerMove(handle, { clientX: 100000 - 10, clientY: 100000 - 10, pointerId: 1 })
      fireEvent.pointerUp(handle, { clientX: 100000 - 10, clientY: 100000 - 10, pointerId: 1 })
      expect(parseFloat(box.style.left)).toBe(leftClamped - 10)
      expect(parseFloat(box.style.top)).toBe(topClamped - 10)
    })

    it('redimensionar (resize): depois do overshoot ser clampado, mover só um pouco na direção oposta já encolhe a caixa de imediato', () => {
      render(<Harness initialWidth={300} aspectRatio={16 / 9} chromeHeight={80} maxWidth={500} />)
      const box = document.getElementById('box')!
      const handle = document.getElementById('resize-handle-br')!
      const widthStart = parseFloat(box.style.width)
      fireEvent.pointerDown(handle, { clientX: widthStart, clientY: 0, pointerId: 1 })
      fireEvent.pointerMove(handle, { clientX: widthStart + 100000, clientY: 0, pointerId: 1 })
      const widthClamped = parseFloat(box.style.width)
      expect(widthClamped).toBe(500) // clampado no maxWidth explícito
      fireEvent.pointerMove(handle, {
        clientX: widthStart + 100000 - 10,
        clientY: 0,
        pointerId: 1,
      })
      fireEvent.pointerUp(handle, {
        clientX: widthStart + 100000 - 10,
        clientY: 0,
        pointerId: 1,
      })
      expect(parseFloat(box.style.width)).toBe(widthClamped - 10)
    })
  })

  describe('CA10: iniciar um arraste/resize não dispara a seleção nativa de texto/elemento do browser', () => {
    it('pointerdown no cabeçalho de arraste chama preventDefault (suprime seleção nativa)', () => {
      render(<Harness />)
      const handle = document.getElementById('handle')!
      const event = fireEvent.pointerDown(handle, { clientX: 500, clientY: 300, pointerId: 1 })
      // fireEvent devolve `false` quando algum listener chamou preventDefault (dispatchEvent).
      expect(event).toBe(false)
    })

    it('pointerdown na alça de resize chama preventDefault (suprime seleção nativa)', () => {
      render(<Harness />)
      const handle = document.getElementById('resize-handle-br')!
      const event = fireEvent.pointerDown(handle, { clientX: 800, clientY: 450, pointerId: 1 })
      expect(event).toBe(false)
    })

    it('pointerdown num botão dentro do cabeçalho NÃO chama preventDefault (clique precisa funcionar normalmente)', () => {
      render(<Harness />)
      const box = document.getElementById('box')!
      const btn = document.createElement('button')
      document.getElementById('handle')!.appendChild(btn)
      const event = fireEvent.pointerDown(btn, { clientX: 10, clientY: 10, pointerId: 1 })
      expect(event).toBe(true)
      expect(box).toBeTruthy()
    })
  })

  describe('CA4: redimensionar pelas 4 quinas — a quina OPOSTA à arrastada fica fixa', () => {
    it('quina tl (superior-esquerda): a quina oposta (inferior-direita) fica fixa; a caixa cresce pra cima/esquerda', () => {
      render(<Harness initialWidth={400} aspectRatio={16 / 9} chromeHeight={80} minWidth={200} />)
      const box = document.getElementById('box')!
      const leftBefore = parseFloat(box.style.left)
      const topBefore = parseFloat(box.style.top)
      const widthBefore = parseFloat(box.style.width)
      const heightBefore = parseFloat(box.style.height)
      const anchorX = leftBefore + widthBefore
      const anchorY = topBefore + heightBefore

      const handle = document.getElementById('resize-handle-tl')!
      fireEvent.pointerDown(handle, { clientX: leftBefore, clientY: topBefore, pointerId: 1 })
      fireEvent.pointerMove(handle, {
        clientX: leftBefore - 50,
        clientY: topBefore - 50,
        pointerId: 1,
      })
      fireEvent.pointerUp(handle, {
        clientX: leftBefore - 50,
        clientY: topBefore - 50,
        pointerId: 1,
      })

      const widthAfter = parseFloat(box.style.width)
      const heightAfter = parseFloat(box.style.height)
      expect(widthAfter).toBe(widthBefore + 50)
      expect(heightAfter).toBeCloseTo(widthAfter / (16 / 9) + 80)
      // a quina inferior-direita (anchor) não se move
      expect(parseFloat(box.style.left) + widthAfter).toBeCloseTo(anchorX)
      expect(parseFloat(box.style.top) + heightAfter).toBeCloseTo(anchorY)
    })

    it('quina tr (superior-direita): a quina oposta (inferior-esquerda) fica fixa; a caixa cresce pra cima/direita', () => {
      render(<Harness initialWidth={400} aspectRatio={16 / 9} chromeHeight={80} minWidth={200} />)
      const box = document.getElementById('box')!
      const leftBefore = parseFloat(box.style.left)
      const topBefore = parseFloat(box.style.top)
      const widthBefore = parseFloat(box.style.width)
      const heightBefore = parseFloat(box.style.height)
      const anchorX = leftBefore // esquerda fixa (mesmo lado da quina inferior-esquerda)
      const anchorY = topBefore + heightBefore // base fixa

      const handle = document.getElementById('resize-handle-tr')!
      fireEvent.pointerDown(handle, {
        clientX: leftBefore + widthBefore,
        clientY: topBefore,
        pointerId: 1,
      })
      fireEvent.pointerMove(handle, {
        clientX: leftBefore + widthBefore + 50,
        clientY: topBefore,
        pointerId: 1,
      })
      fireEvent.pointerUp(handle, {
        clientX: leftBefore + widthBefore + 50,
        clientY: topBefore,
        pointerId: 1,
      })

      const widthAfter = parseFloat(box.style.width)
      const heightAfter = parseFloat(box.style.height)
      expect(widthAfter).toBe(widthBefore + 50)
      expect(parseFloat(box.style.left)).toBeCloseTo(anchorX) // esquerda não se move
      expect(parseFloat(box.style.top)).toBeCloseTo(anchorY - heightAfter) // topo sobe, base fixa
    })

    it('quina bl (inferior-esquerda): a quina oposta (superior-direita) fica fixa; a caixa cresce pra baixo/esquerda', () => {
      render(<Harness initialWidth={400} aspectRatio={16 / 9} chromeHeight={80} minWidth={200} />)
      const box = document.getElementById('box')!
      const leftBefore = parseFloat(box.style.left)
      const topBefore = parseFloat(box.style.top)
      const widthBefore = parseFloat(box.style.width)

      const handle = document.getElementById('resize-handle-bl')!
      fireEvent.pointerDown(handle, { clientX: leftBefore, clientY: topBefore, pointerId: 1 })
      fireEvent.pointerMove(handle, { clientX: leftBefore - 50, clientY: topBefore, pointerId: 1 })
      fireEvent.pointerUp(handle, { clientX: leftBefore - 50, clientY: topBefore, pointerId: 1 })

      const widthAfter = parseFloat(box.style.width)
      expect(widthAfter).toBe(widthBefore + 50)
      expect(parseFloat(box.style.top)).toBeCloseTo(topBefore) // topo não se move (quina de baixo)
      expect(parseFloat(box.style.left)).toBeCloseTo(leftBefore - 50) // esquerda segue o mouse
    })

    it('quina br (inferior-direita) continua sendo a mesma de sempre — não muda com a introdução das outras 3', () => {
      render(<Harness initialWidth={400} aspectRatio={16 / 9} chromeHeight={80} minWidth={200} />)
      const box = document.getElementById('box')!
      const leftBefore = parseFloat(box.style.left)
      const topBefore = parseFloat(box.style.top)
      const widthBefore = parseFloat(box.style.width)

      const handle = document.getElementById('resize-handle-br')!
      fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
      fireEvent.pointerMove(handle, { clientX: 50, clientY: 0, pointerId: 1 })
      fireEvent.pointerUp(handle, { clientX: 50, clientY: 0, pointerId: 1 })

      expect(parseFloat(box.style.width)).toBe(widthBefore + 50)
      expect(parseFloat(box.style.left)).toBeCloseTo(leftBefore) // topo-esquerda (anchor) intacto
      expect(parseFloat(box.style.top)).toBeCloseTo(topBefore)
    })
  })

  describe('CA4: resizable=false desliga todas as alças de resize (usado no celular)', () => {
    it('resizeHandleProps é null — nenhuma alça é renderizada', () => {
      render(<Harness resizable={false} />)
      expect(document.getElementById('resize-handle-br')).toBeNull()
      expect(document.getElementById('resize-handle-tl')).toBeNull()
      expect(document.getElementById('resize-handle-tr')).toBeNull()
      expect(document.getElementById('resize-handle-bl')).toBeNull()
      // arrastar pelo cabeçalho continua funcionando — só o resize é desligado
      expect(document.getElementById('handle')).not.toBeNull()
    })
  })

  describe('CA4: lockAspectRatio=false — altura não é travada, caixa nasce encostada no topo', () => {
    it('style.height não é definido (conteúdo real dita o tamanho, sem cortar nada por uma estimativa fixa)', () => {
      render(<Harness lockAspectRatio={false} />)
      expect(document.getElementById('box')!.style.height).toBe('')
    })

    it('caixa nasce encostada no topo (top: 0), não centralizada por uma altura que não existe', () => {
      render(<Harness lockAspectRatio={false} />)
      expect(document.getElementById('box')!.style.top).toBe('0px')
    })
  })

  describe('CA4: viewportMargin=0 — a largura pode ocupar a viewport inteira (full-bleed, celular)', () => {
    it('largura inicial vai até innerWidth, sem margem', () => {
      render(<Harness initialWidth={10000} viewportMargin={0} />)
      expect(parseFloat(document.getElementById('box')!.style.width)).toBe(window.innerWidth)
    })

    it('caixa nasce encostada na borda esquerda (left: 0)', () => {
      render(<Harness initialWidth={10000} viewportMargin={0} />)
      expect(document.getElementById('box')!.style.left).toBe('0px')
    })
  })
})
