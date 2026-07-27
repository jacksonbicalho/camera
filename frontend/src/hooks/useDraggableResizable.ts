import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

export interface UseDraggableResizableOptions {
  /** largura/altura do conteúdo que precisa manter a proporção (ex.: 16/9 pro vídeo). */
  aspectRatio: number
  initialWidth: number
  minWidth: number
  /** Default: largura da viewport menos uma margem, recalculado a cada resize (não fixo). */
  maxWidth?: number
  /** Altura fixa somada por cima da altura do vídeo (cabeçalho + rodapé) — não escala com o
   * resize, só a área do vídeo em si (por isso a proporção do VÍDEO se mantém, não a da caixa
   * inteira). */
  chromeHeight: number
}

export interface DraggableResizable {
  style: CSSProperties
  dragHandleProps: {
    onPointerDown: (e: PointerEvent) => void
    onPointerMove: (e: PointerEvent) => void
    onPointerUp: (e: PointerEvent) => void
  }
  resizeHandleProps: {
    onPointerDown: (e: PointerEvent) => void
    onPointerMove: (e: PointerEvent) => void
    onPointerUp: (e: PointerEvent) => void
  }
}

const VIEWPORT_MARGIN = 32

function viewportWidth(): number {
  return typeof window === 'undefined' ? 1024 : window.innerWidth
}
function viewportHeight(): number {
  return typeof window === 'undefined' ? 768 : window.innerHeight
}

// useDraggableResizable — arrastar (pelo cabeçalho) e redimensionar (por uma alça no canto)
// uma caixa flutuante via Pointer Events puros (mesmo padrão de usePlayerZoom — sem lib de
// drag/resize). A altura NUNCA é estado próprio: é sempre derivada da largura (`width /
// aspectRatio + chromeHeight`), o que garante a proporção travada por construção — não tem
// como os dois estados divergirem porque só um existe.
export function useDraggableResizable({
  aspectRatio,
  initialWidth,
  minWidth,
  maxWidth,
  chromeHeight,
}: UseDraggableResizableOptions): DraggableResizable {
  // clampWidth recebe a posição ATUAL da caixa (leftPos/topPos — fixos durante um resize, só
  // `width` muda) pra nunca deixar a borda direita (`leftPos + w`) nem a de baixo
  // (`topPos + w/aspectRatio + chromeHeight`) passarem da viewport — não é só o teto
  // explícito/default (`maxWidth`) que importa, a POSIÇÃO da caixa também limita até onde ela
  // pode crescer sem sair da tela (achado real do navigator: "é preciso que ele tenha limites
  // também a esquerda, direita e em baixo").
  const clampWidth = useCallback(
    (w: number, leftPos: number, topPos: number) => {
      const maxByDefault = maxWidth ?? viewportWidth() - VIEWPORT_MARGIN * 2
      const maxByRightEdge = viewportWidth() - leftPos
      const maxByBottomEdge = (viewportHeight() - topPos - chromeHeight) * aspectRatio
      const max = Math.min(maxByDefault, maxByRightEdge, maxByBottomEdge)
      return Math.min(max, Math.max(minWidth, w))
    },
    [minWidth, maxWidth, aspectRatio, chromeHeight],
  )

  const [width, setWidth] = useState(() => clampWidth(initialWidth, 0, 0))
  const height = width / aspectRatio + chromeHeight

  const [pos, setPos] = useState(() => ({
    top: Math.max(0, (viewportHeight() - height) / 2),
    left: Math.max(0, (viewportWidth() - width) / 2),
  }))

  const dragRef = useRef<{ x: number; y: number; top: number; left: number } | null>(null)
  const onDragPointerDown = useCallback(
    (e: PointerEvent) => {
      // Não inicia arraste a partir de um botão do cabeçalho (fechar, "Visualizar no
      // histórico") — deixa o clique passar, mesmo tratamento de usePlayerZoom pro pan.
      if ((e.target as HTMLElement).closest('button')) return
      dragRef.current = { x: e.clientX, y: e.clientY, top: pos.top, left: pos.left }
      e.currentTarget.setPointerCapture?.(e.pointerId)
    },
    [pos],
  )
  const onDragPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      const vw = viewportWidth()
      const vh = viewportHeight()
      // Contenção total nas 4 bordas — a caixa INTEIRA (não só uma margem/faixa dela) sempre
      // cabe na viewport: `top`/`left` nunca negativos (não sai por cima/pela esquerda) e
      // nunca deixam `top+height`/`left+width` passarem de `vh`/`vw` (não sai por baixo/pela
      // direita). Antes só o topo tinha um limite de verdade (`Math.max(0, ...)`) — esquerda,
      // direita e base só tinham uma margem parcial (`DRAG_VISIBLE_MARGIN`), deixando a maior
      // parte da caixa sair da tela (bug real, reportado pelo navigator).
      setPos({
        top: Math.min(Math.max(0, d.top + dy), Math.max(0, vh - height)),
        left: Math.min(Math.max(0, d.left + dx), Math.max(0, vw - width)),
      })
    },
    [width, height],
  )
  const onDragPointerUp = useCallback((e: PointerEvent) => {
    dragRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }, [])

  const resizeRef = useRef<{ x: number; startWidth: number } | null>(null)
  const onResizePointerDown = useCallback(
    (e: PointerEvent) => {
      resizeRef.current = { x: e.clientX, startWidth: width }
      e.currentTarget.setPointerCapture?.(e.pointerId)
    },
    [width],
  )
  const onResizePointerMove = useCallback(
    (e: PointerEvent) => {
      const r = resizeRef.current
      if (!r) return
      setWidth(clampWidth(r.startWidth + (e.clientX - r.x), pos.left, pos.top))
    },
    // `pos.left`/`pos.top` (primitivos), não o objeto `pos` inteiro — mesma convenção que o
    // T4 desta história estabeleceu (usePlayerZoom.ts: depender de valores/métodos
    // específicos, nunca do objeto envoltório, que troca de referência à toa).
    [clampWidth, pos.left, pos.top],
  )
  const onResizePointerUp = useCallback((e: PointerEvent) => {
    resizeRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }, [])

  return {
    style: { position: 'fixed', top: pos.top, left: pos.left, width, height },
    dragHandleProps: {
      onPointerDown: onDragPointerDown,
      onPointerMove: onDragPointerMove,
      onPointerUp: onDragPointerUp,
    },
    resizeHandleProps: {
      onPointerDown: onResizePointerDown,
      onPointerMove: onResizePointerMove,
      onPointerUp: onResizePointerUp,
    },
  }
}
