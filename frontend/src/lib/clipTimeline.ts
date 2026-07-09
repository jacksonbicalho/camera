// clipTimeline: matemática pura da linha do tempo de um clipe multi-segmento. O clipe é
// uma playlist de recortes de arquivos diferentes; o player precisa mapear a posição
// global (a barra de progresso que o usuário vê) para (segmento, offset dentro do
// arquivo) e vice-versa. Vive separado da página para ser testável sem DOM/vídeo.
//
// TimedSegment é a forma mínima que essas funções precisam — tanto ClipSegment
// (recordingsGateway, usado pelo VideoBrowserPage) quanto VideoPlayerSegment
// (VideoPlayer.tsx) satisfazem essa forma estruturalmente, sem acoplar este módulo a
// nenhum dos dois.
export interface TimedSegment {
  fromSeconds: number
  toSeconds: number
}

// segmentDuration é a duração reproduzível (s) de um segmento. Prefere a duração real do
// arquivo quando conhecida — o toSeconds inferido (= start do próximo chunk) pode passar
// da duração por causa dos vãos entre chunks. toSeconds Infinity (segmento único = arquivo
// inteiro) → duração real, ou 0 enquanto ela não é conhecida.
export function segmentDuration(seg: TimedSegment, realDuration?: number): number {
  let end: number
  if (Number.isFinite(seg.toSeconds)) {
    end = realDuration !== undefined ? Math.min(seg.toSeconds, realDuration) : seg.toSeconds
  } else {
    end = realDuration ?? 0
  }
  return Math.max(0, end - seg.fromSeconds)
}

// clipTotal soma as durações dos segmentos (duração total do clipe, em segundos).
export function clipTotal(durations: number[]): number {
  return durations.reduce((acc, d) => acc + d, 0)
}

// globalTime converte (segmento atual, offset local dentro dele) na posição global.
export function globalTime(durations: number[], index: number, localOffset: number): number {
  let base = 0
  for (let i = 0; i < index && i < durations.length; i++) base += durations[i]
  return base + Math.max(0, localOffset)
}

// locate faz o inverso: dada uma posição global, devolve o segmento que a contém e o
// offset local dentro dele. Clampa em [0, total].
export function locate(
  durations: number[],
  global: number,
): { index: number; localOffset: number } {
  if (durations.length === 0) return { index: 0, localOffset: 0 }
  let remaining = Math.max(0, global)
  for (let i = 0; i < durations.length; i++) {
    if (remaining < durations[i] || i === durations.length - 1) {
      return { index: i, localOffset: Math.min(remaining, durations[i]) }
    }
    remaining -= durations[i]
  }
  return { index: durations.length - 1, localOffset: 0 }
}

// formatClock formata segundos como m:ss (ou h:mm:ss) para o display de tempo.
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const s = Math.floor(seconds % 60)
  const m = Math.floor((seconds / 60) % 60)
  const h = Math.floor(seconds / 3600)
  const ss = String(s).padStart(2, '0')
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}
