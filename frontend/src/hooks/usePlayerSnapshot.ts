import { useCallback } from 'react'

// usePlayerSnapshot — captura o frame atual de um <video> e dispara o download como PNG.
// Padrão web direto: desenha o frame num <canvas> (dimensões do próprio vídeo, não do
// elemento na tela — evita recorte/downscale) via drawImage, converte pra blob (toBlob) e
// aciona um <a download> temporário. Sem CORS especial: o vídeo é sempre same-origin (servido
// pelo próprio backend, HLS/WebRTC/MP4). `filenamePrefix` (ex. nome da câmera) é opcional —
// sem ele, cai no nome genérico "snapshot".
export function usePlayerSnapshot(
  getVideoEl: () => HTMLVideoElement | null,
  filenamePrefix?: string,
) {
  const takeSnapshot = useCallback(() => {
    const video = getVideoEl()
    if (!video || !video.videoWidth || !video.videoHeight) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filenamePrefix ?? 'snapshot'}-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }, [getVideoEl, filenamePrefix])

  return { takeSnapshot }
}
