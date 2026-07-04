export const RETRY_BASE_MS = 2000
export const RETRY_MAX_MS = 30000
export const RETRY_MAX_ATTEMPTS = 6

// retryPlan decide o próximo retry após uma falha de conexão do Player: backoff
// exponencial com teto, e desiste após RETRY_MAX_ATTEMPTS. Substitui o loop fixo
// de 2s do HLSPlayer legado, que martelava o servidor quando o stream não estava
// disponível.
export function retryPlan(attempt: number): { delay: number; giveUp: boolean } {
  if (attempt >= RETRY_MAX_ATTEMPTS) return { delay: 0, giveUp: true }
  return { delay: Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS), giveUp: false }
}
