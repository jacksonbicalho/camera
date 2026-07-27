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
// Mantém pelo menos essa faixa do topo/lateral dentro da viewport ao arrastar — nunca deixa o
// cabeçalho (única alça de arrastar) sair de alcance do cursor.
const DRAG_VISIBLE_MARGIN = 80

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
  const clampWidth = useCallback(
    (w: number) => {
      const max = maxWidth ?? viewportWidth() - VIEWPORT_MARGIN * 2
      return Math.min(max, Math.max(minWidth, w))
    },
    [minWidth, maxWidth],
  )

  const [width, setWidth] = useState(() => clampWidth(initialWidth))
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
      setPos({
        top: Math.min(Math.max(0, d.top + dy), Math.max(0, vh - DRAG_VISIBLE_MARGIN)),
        left: Math.min(
          Math.max(-(width - DRAG_VISIBLE_MARGIN), d.left + dx),
          vw - DRAG_VISIBLE_MARGIN,
        ),
      })
    },
    [width],
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
      setWidth(clampWidth(r.startWidth + (e.clientX - r.x)))
    },
    [clampWidth],
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
