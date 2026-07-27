import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IDENTITY,
  MAX_SCALE,
  MIN_SCALE,
  isZoomed as isZoomedState,
  panBy,
  transformStyle,
  zoomAtPoint,
  type ZoomState,
} from '../pages/playerZoom'

const WHEEL_FACTOR = 1.15
const DRAG_THRESHOLD = 3

export interface PlayerZoom {
  // setContainer: callback ref for the wrapper div; (re)binds the non-passive
  // wheel listener whenever the node changes (e.g. live ↔ recording switch).
  setContainer: (node: HTMLDivElement | null) => void
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  isZoomed: boolean
  scale: number
  reset: () => void
  // zoomIn/zoomOut — mesmo fator do scroll (WHEEL_FACTOR), só que disparado por clique (ex.:
  // componente Zoom no rodapé) em vez de scroll/pinch, e ancorado no CENTRO do container (sem
  // cursor pra ancorar em) em vez do ponto do mouse. canZoomIn/canZoomOut refletem se ainda há
  // margem antes de MIN_SCALE/MAX_SCALE — pro consumidor desabilitar o botão correspondente.
  zoomIn: () => void
  zoomOut: () => void
  canZoomIn: boolean
  canZoomOut: boolean
  // consumeDrag returns (and clears) whether the last pointer interaction was a
  // pan — used to suppress the click that would otherwise toggle playback.
  consumeDrag: () => boolean
}

// usePlayerZoom wires scroll-to-zoom (at the cursor) and drag-to-pan onto a video
// player. The transform is applied imperatively to the <video> returned by
// getVideoEl so overlays and controls in the wrapper stay put.
export function usePlayerZoom(getVideoEl: () => HTMLVideoElement | null): PlayerZoom {
  const [zoom, setZoom] = useState<ZoomState>(IDENTITY)
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const draggedRef = useRef(false)

  // Apply the current transform to whichever video is active.
  useEffect(() => {
    const v = getVideoEl()
    if (!v) return
    v.style.transformOrigin = '0 0'
    v.style.transform = transformStyle(zoom)
  }, [zoom, getVideoEl])

  const setContainer = useCallback((node: HTMLDivElement | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    nodeRef.current = node
    if (!node) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = node.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const factor = e.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR
      setZoom((z) => zoomAtPoint(z, factor, cx, cy, rect.width, rect.height))
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    cleanupRef.current = () => node.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => () => cleanupRef.current?.(), [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isZoomedState(zoom)) return
      // Não inicia pan sobre botões (reset, play/pause) — deixa o clique passar.
      if ((e.target as HTMLElement).closest('button')) return
      drag.current = { x: e.clientX, y: e.clientY, moved: false }
      e.currentTarget.setPointerCapture?.(e.pointerId)
    },
    [zoom],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) d.moved = true
    d.x = e.clientX
    d.y = e.clientY
    const rect = nodeRef.current?.getBoundingClientRect()
    if (!rect) return
    setZoom((z) => panBy(z, dx, dy, rect.width, rect.height))
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (drag.current?.moved) draggedRef.current = true
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }, [])

  const reset = useCallback(() => setZoom(IDENTITY), [])

  // zoomBy aplica `factor` em torno do CENTRO do container atual (nodeRef, o mesmo node que
  // setContainer já mantém pro listener de wheel) — sem container ainda vinculado, no-op (não
  // deveria acontecer na prática, já que o componente Zoom só existe dentro de um player já
  // montado, mas evita quebrar se chamado cedo demais).
  const zoomBy = useCallback((factor: number) => {
    const node = nodeRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    setZoom((z) => zoomAtPoint(z, factor, rect.width / 2, rect.height / 2, rect.width, rect.height))
  }, [])
  const zoomIn = useCallback(() => zoomBy(WHEEL_FACTOR), [zoomBy])
  const zoomOut = useCallback(() => zoomBy(1 / WHEEL_FACTOR), [zoomBy])

  const consumeDrag = useCallback(() => {
    const d = draggedRef.current
    draggedRef.current = false
    return d
  }, [])

  // Memoizado: o objeto serve pra passar como prop de uma vez (`<Zoom zoom={zoom} />`,
  // `zoom.onPointerDown` etc. direto no JSX) sem gerar uma referência nova a cada render à
  // toa. MAS um `useCallback`/`useEffect` que precisa de zoom NUNCA deve depender do objeto
  // INTEIRO — ele troca de referência a cada mudança de zoom (scroll, pan, os botões de
  // Zoom.tsx), então qualquer callback que dependa de `zoom` (em vez de `zoom.reset`/
  // `zoom.setContainer` — os métodos específicos, que SÃO estáveis) também troca de
  // referência a cada zoom. Se esse callback por sua vez alimentar um efeito (ex.:
  // `startPlayback` em VideoPlayer.tsx), o efeito reroda a cada zoom — bug real já
  // encontrado uma vez (o vídeo reiniciava do zero a cada clique no zoom em vez de só
  // aplicar o zoom, reportado pelo navigator). Sempre depender do MÉTODO específico usado,
  // nunca do objeto `zoom` inteiro, num array de dependências.
  return useMemo(
    () => ({
      setContainer,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      isZoomed: isZoomedState(zoom),
      scale: zoom.scale,
      reset,
      zoomIn,
      zoomOut,
      canZoomIn: zoom.scale < MAX_SCALE,
      canZoomOut: zoom.scale > MIN_SCALE,
      consumeDrag,
    }),
    [
      setContainer,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      zoom,
      reset,
      zoomIn,
      zoomOut,
      consumeDrag,
    ],
  )
}
