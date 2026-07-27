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
}

function Harness({
  aspectRatio = 16 / 9,
  initialWidth = 800,
  minWidth = 320,
  maxWidth,
  chromeHeight = 80,
}: HarnessProps) {
  const { style, dragHandleProps, resizeHandleProps } = useDraggableResizable({
    aspectRatio,
    initialWidth,
    minWidth,
    maxWidth,
    chromeHeight,
  })
  return (
    <div id="box" style={style}>
      <div id="handle" {...dragHandleProps} />
      <div id="resize-handle" {...resizeHandleProps} />
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
      const handle = document.getElementById('resize-handle')!
      fireEvent.pointerDown(handle, { clientX: 800, clientY: 450, pointerId: 1 })
      fireEvent.pointerMove(handle, { clientX: 900, clientY: 450, pointerId: 1 })
      fireEvent.pointerUp(handle, { clientX: 900, clientY: 450, pointerId: 1 })
      const box = document.getElementById('box')!
      expect(box.style.width).toBe('900px')
      expect(box.style.height).toBe(`${900 / (16 / 9) + 80}px`)
    })

    it('não redimensiona abaixo de minWidth', () => {
      render(<Harness initialWidth={400} aspectRatio={16 / 9} chromeHeight={80} minWidth={320} />)
      const handle = document.getElementById('resize-handle')!
      fireEvent.pointerDown(handle, { clientX: 400, clientY: 300, pointerId: 1 })
      fireEvent.pointerMove(handle, { clientX: 0, clientY: 300, pointerId: 1 })
      fireEvent.pointerUp(handle, { clientX: 0, clientY: 300, pointerId: 1 })
      expect(document.getElementById('box')!.style.width).toBe('320px')
    })

    it('não redimensiona acima de maxWidth', () => {
      render(<Harness initialWidth={400} aspectRatio={16 / 9} chromeHeight={80} maxWidth={500} />)
      const handle = document.getElementById('resize-handle')!
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

      const resizeHandle = document.getElementById('resize-handle')!
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
})
