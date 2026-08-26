// Piso de segurança: nunca deixa o teto do eixo abaixo de 0.001, mesmo numa
// câmera recém-instalada sem threshold/pico ainda relevante — evita um
// gráfico absurdamente "zoomado" no ruído de fundo.
const MIN_CEILING = 0.001

// computeLogMax escolhe o teto do eixo do MotionScoreChart (expoente de uma
// potência de 10) dinamicamente: a menor potência de 10 que fica >= 1.5x o
// maior valor relevante conhecido (limiar configurado ou pico do dia). Fixo
// em 1.0 o eixo nunca refletia a faixa real de operação — score de
// movimento real quase nunca passa de centésimos (ver docs/motion.md), então
// a linha sempre ficava "grudada" longe do topo mesmo com o sistema
// calibrado e funcionando (incidente 2026-08-26).
export function computeLogMax(threshold: number, dailyPeak: number): number {
  const relevant = Math.max(threshold, dailyPeak, MIN_CEILING)
  return Math.ceil(Math.log10(relevant * 1.5))
}
