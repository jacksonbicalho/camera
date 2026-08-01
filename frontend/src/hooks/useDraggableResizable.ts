import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

export type ResizeCorner = 'tl' | 'tr' | 'bl' | 'br'

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
  /** false desliga as 4 alças de resize (`resizeHandleProps` vira `null`) — usado no celular,
   * onde a caixa já ocupa a largura toda e redimensionar manualmente não faz sentido. Default
   * `true`. */
  resizable?: boolean
  /** false: a altura NÃO é travada em `largura/aspectRatio+chromeHeight` — fica fora do `style`
   * (CSS `auto`, o conteúdo real dita o tamanho, sem cortar nada por uma estimativa de chrome
   * errada em telas estreitas) e a caixa nasce encostada no topo (`top: 0`) em vez de
   * centralizada por uma altura que não é mais fixa. Default `true`. */
  lockAspectRatio?: boolean
  /** margem mínima até a borda da viewport pro teto padrão de largura (cada lado). `0` = a
   * caixa pode ocupar a viewport inteira (full-bleed, celular). Default `32`. */
  viewportMargin?: number
}

interface PointerHandlers {
  onPointerDown: (e: PointerEvent) => void
  onPointerMove: (e: PointerEvent) => void
  onPointerUp: (e: PointerEvent) => void
}

export interface DraggableResizable {
  style: CSSProperties
  dragHandleProps: PointerHandlers
  resizeHandleProps: Record<ResizeCorner, PointerHandlers> | null
}

const DEFAULT_VIEWPORT_MARGIN = 32
const RESIZE_CORNERS: readonly ResizeCorner[] = ['tl', 'tr', 'bl', 'br']

function viewportWidth(): number {
  return typeof window === 'undefined' ? 1024 : window.innerWidth
}
function viewportHeight(): number {
  return typeof window === 'undefined' ? 768 : window.innerHeight
}

// growDirection — cada quina cresce a caixa em duas direções independentes: horizontal
// (esquerda/direita) e vertical (cima/baixo). `tl`/`bl` crescem pra ESQUERDA (a quina
// direita correspondente fica fixa); `tl`/`tr` crescem pra CIMA (a quina de baixo
// correspondente fica fixa). `br` (a única quina que existia antes desta história) não cresce
// pra nenhum dos dois lados "invertidos" — mantém o comportamento de sempre.
function growDirection(corner: ResizeCorner): { growLeft: boolean; growUp: boolean } {
  return {
    growLeft: corner === 'tl' || corner === 'bl',
    growUp: corner === 'tl' || corner === 'tr',
  }
}

// useDraggableResizable — arrastar (pelo cabeçalho) e redimensionar (por uma alça em cada
// quina) uma caixa flutuante via Pointer Events puros (mesmo padrão de usePlayerZoom — sem lib
// de drag/resize). A altura, quando travada (`lockAspectRatio`), NUNCA é estado próprio: é
// sempre derivada da largura (`width / aspectRatio + chromeHeight`), o que garante a proporção
// travada por construção — não tem como os dois estados divergirem porque só um existe.
export function useDraggableResizable({
  aspectRatio,
  initialWidth,
  minWidth,
  maxWidth,
  chromeHeight,
  resizable = true,
  lockAspectRatio = true,
  viewportMargin = DEFAULT_VIEWPORT_MARGIN,
}: UseDraggableResizableOptions): DraggableResizable {
  // clampWidthAnchored generaliza o clamp de largura pra qualquer quina: `anchorX`/`anchorY`
  // são as coordenadas da quina OPOSTA à que está sendo arrastada (fica fixa durante o
  // resize inteiro); `growLeft`/`growUp` dizem se a caixa cresce PRA a esquerda/cima (limitado
  // pela distância do anchor até a borda 0 da viewport) ou pra direita/baixo (limitado pela
  // distância do anchor até a borda LONGE da viewport — mesma fórmula de sempre, usada pela
  // quina `br`, a única que existia antes desta história). `anchorX`/`anchorY` == posição
  // atual (top-left) da caixa reproduz exatamente o comportamento antigo (quina `br`).
  const clampWidthAnchored = useCallback(
    (w: number, anchorX: number, anchorY: number, growLeft: boolean, growUp: boolean) => {
      const maxByDefault = maxWidth ?? viewportWidth() - viewportMargin * 2
      const maxByHorizontalEdge = growLeft ? anchorX : viewportWidth() - anchorX
      const maxByVerticalEdge = growUp
        ? (anchorY - chromeHeight) * aspectRatio
        : (viewportHeight() - anchorY - chromeHeight) * aspectRatio
      const max = Math.min(maxByDefault, maxByHorizontalEdge, maxByVerticalEdge)
      return Math.min(max, Math.max(minWidth, w))
    },
    [minWidth, maxWidth, aspectRatio, chromeHeight, viewportMargin],
  )

  // width/top/left vivem num ÚNICO estado (`box`), não três separados — o resize das 4 quinas
  // (`makeResizeHandlers` abaixo) precisa atualizar os três juntos a partir do valor mais
  // recente de forma ATÔMICA via `setBox(prev => ...)`: com estados separados, dois
  // `pointermove` nativos despachados antes do React comitar o render anterior (automatic
  // batching do React 18 — mais provável com ponteiro/toque de alta frequência) fariam o 2º
  // evento recalcular a partir de um `width`/`pos` ainda desatualizados (capturados por
  // closure no render em que o handler foi criado), descartando o delta do 1º evento — a
  // caixa "atrasa" em relação ao cursor permanentemente (achado real do code review). Um
  // único `setBox` funcional elimina essa janela: cada atualização em fila já enxerga o
  // resultado da anterior.
  const [box, setBox] = useState(() => {
    const initWidth = clampWidthAnchored(initialWidth, 0, 0, false, false)
    const initHeight = initWidth / aspectRatio + chromeHeight
    return {
      width: initWidth,
      top: lockAspectRatio ? Math.max(0, (viewportHeight() - initHeight) / 2) : 0,
      left: Math.max(0, (viewportWidth() - initWidth) / 2),
    }
  })
  const { width, top, left } = box
  const height = width / aspectRatio + chromeHeight

  // dragRef guarda só a ÚLTIMA posição do ponteiro (não a posição/tamanho da caixa no
  // pointerdown) — atualizada a cada `pointermove`, pra computar o delta desde o ÚLTIMO
  // evento, não desde o início do arraste. Isso é o que evita o cursor "descolar" do ponto
  // agarrado: com uma âncora FIXA (capturada uma vez no pointerdown), bater num limite (clamp)
  // faz a diferença entre "onde o mouse está" e "onde a caixa pararia sem clamp" se acumular
  // (banked) — a caixa só volta a se mover quando o mouse percorrer de volta essa distância
  // INTEIRA, criando uma zona morta perceptível (mais notável com movimento rápido, que banca
  // um overshoot maior num único evento). Com âncora incremental, cada evento aplica um delta
  // PEQUENO sobre a posição JÁ CLAMPADA (via `setBox` funcional) — assim que o mouse
  // muda de direção, mesmo 1px, a caixa reage de imediato, sem "descontar" nada primeiro. Mesma
  // técnica que `usePlayerZoom.ts` já usa pro pan (`onPointerMove` atualiza `d.x`/`d.y` a cada
  // evento). Bug real, reportado pelo navigator: "o ícone que representa ter agarrado o modal
  // não fica fixo... quando o modal chega em algum limite o ícone continua e sai fora de onde
  // foi pressionado".
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const onDragPointerDown = useCallback((e: PointerEvent) => {
    // Não inicia arraste a partir de um botão do cabeçalho (fechar, "Visualizar no
    // histórico") — deixa o clique passar, mesmo tratamento de usePlayerZoom pro pan.
    if ((e.target as HTMLElement).closest('button')) return
    // Suprime o gesto NATIVO de seleção que o browser inicia por padrão nesse mesmo
    // pointerdown+move (destacar texto sob o cabeçalho, ex. a data, ou iniciar um
    // drag-ghost nativo do <video> por baixo) — sem isso, o arraste custom via Pointer
    // Events roda em paralelo com a seleção nativa do browser, que passa a mostrar seu
    // próprio cursor na posição REAL do mouse (que pode estar longe do cabeçalho, já que
    // nada prende o mouse a essa faixa depois do pointerdown) — dá a impressão de que "o
    // ícone de arrastar se perdeu". Bug real, reportado pelo navigator com screenshot.
    e.preventDefault()
    dragRef.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [])
  const onDragPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      d.x = e.clientX
      d.y = e.clientY
      const vw = viewportWidth()
      const vh = viewportHeight()
      // Contenção total nas 4 bordas — a caixa INTEIRA (não só uma margem/faixa dela) sempre
      // cabe na viewport: `top`/`left` nunca negativos (não sai por cima/pela esquerda) e
      // nunca deixam `top+height`/`left+width` passarem de `vh`/`vw` (não sai por baixo/pela
      // direita).
      setBox((prev) => ({
        ...prev,
        top: Math.min(Math.max(0, prev.top + dy), Math.max(0, vh - height)),
        left: Math.min(Math.max(0, prev.left + dx), Math.max(0, vw - width)),
      }))
    },
    [width, height],
  )
  const onDragPointerUp = useCallback((e: PointerEvent) => {
    dragRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }, [])

  // resizeRef guarda a quina em resize + a ÚLTIMA posição horizontal do ponteiro + o anchor
  // (quina OPOSTA, fixa durante o resize inteiro) capturado no pointerdown — um único ref
  // compartilhado pelas 4 quinas (só uma pode estar em resize por vez, mesma suposição de
  // ponteiro único do resto do hook).
  const resizeRef = useRef<{
    corner: ResizeCorner
    x: number
    anchorX: number
    anchorY: number
  } | null>(null)

  // makeResizeHandlers — uma quina só difere de outra por QUAL direção cresce (`growDirection`)
  // e por onde fica o anchor no pointerdown; o resto (clamp, atualização de width/pos) é
  // idêntico. `anchorX`/`anchorY` == posição atual da caixa reproduz exatamente o
  // comportamento antigo pra `br` (a única quina que existia antes desta história).
  const makeResizeHandlers = useCallback(
    (corner: ResizeCorner): PointerHandlers => {
      const { growLeft, growUp } = growDirection(corner)
      return {
        onPointerDown: (e: PointerEvent) => {
          // Mesmo motivo do preventDefault em onDragPointerDown — ver comentário lá.
          e.preventDefault()
          resizeRef.current = {
            corner,
            x: e.clientX,
            anchorX: growLeft ? left + width : left,
            anchorY: growUp ? top + height : top,
          }
          e.currentTarget.setPointerCapture?.(e.pointerId)
        },
        onPointerMove: (e: PointerEvent) => {
          const r = resizeRef.current
          if (!r || r.corner !== corner) return
          const dx = e.clientX - r.x
          r.x = e.clientX
          const deltaWidth = growLeft ? -dx : dx
          // setBox funcional (ver comentário no estado `box` acima) — `prev.width` nunca fica
          // atrás de um evento anterior ainda não comitado, mesmo sob automatic batching.
          setBox((prev) => {
            const newWidth = clampWidthAnchored(
              prev.width + deltaWidth,
              r.anchorX,
              r.anchorY,
              growLeft,
              growUp,
            )
            const newHeight = newWidth / aspectRatio + chromeHeight
            return {
              width: newWidth,
              left: growLeft ? r.anchorX - newWidth : r.anchorX,
              top: growUp ? r.anchorY - newHeight : r.anchorY,
            }
          })
        },
        onPointerUp: (e: PointerEvent) => {
          if (resizeRef.current?.corner === corner) resizeRef.current = null
          e.currentTarget.releasePointerCapture?.(e.pointerId)
        },
      }
    },
    [width, height, top, left, clampWidthAnchored, aspectRatio, chromeHeight],
  )

  const resizeHandleProps = resizable
    ? (Object.fromEntries(
        RESIZE_CORNERS.map((corner) => [corner, makeResizeHandlers(corner)]),
      ) as Record<ResizeCorner, PointerHandlers>)
    : null

  return {
    style: {
      position: 'fixed',
      top,
      left,
      width,
      ...(lockAspectRatio ? { height } : {}),
    },
    dragHandleProps: {
      onPointerDown: onDragPointerDown,
      onPointerMove: onDragPointerMove,
      onPointerUp: onDragPointerUp,
    },
    resizeHandleProps,
  }
}
