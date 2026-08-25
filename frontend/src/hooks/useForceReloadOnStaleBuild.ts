import { useEffect, useRef } from 'react'
import { authHeaders } from '../auth'

// useForceReloadOnStaleBuild — história feat/forcar-atualizacao-app-ao-reabrir.
// Um PWA reaberto pelo ícone da tela inicial muitas vezes só traz de volta
// ao primeiro plano uma aba que o sistema operacional mantinha suspensa —
// sem navegação nova, sem requisição de rede — então o JS antigo continua
// rodando na memória mesmo depois de um deploy (os bundles JS/CSS já são
// imunes a cache obsoleto via hash de conteúdo do Vite; o problema não é
// cache HTTP). Detecta isso comparando o `commit` de GET /api/about (já
// existente, authFull) a cada vez que a página volta a ficar visível
// (`visibilitychange`) contra o commit capturado no mount — divergiu, é
// porque o servidor já rodou um build mais novo, então recarrega.
//
// Fail-open: sem sessão válida (401) ou rede indisponível, fetchCommit
// devolve null e a checagem simplesmente não reage — nunca um erro visível
// ao usuário, nunca um reload espúrio.
async function fetchCommit(): Promise<string | null> {
  try {
    const res = await fetch('/api/about', { headers: authHeaders() })
    if (!res.ok) return null
    const body: unknown = await res.json()
    const commit = (body as { commit?: unknown } | null)?.commit
    return typeof commit === 'string' && commit !== '' ? commit : null
  } catch {
    return null
  }
}

export function useForceReloadOnStaleBuild(): void {
  const baselineRef = useRef<string | null>(null)

  useEffect(() => {
    // checkAndMaybeReload também é usado no mount pra ESTABELECER o
    // baseline (nada pra comparar ainda) — só reage quando já existe um
    // baseline anterior e o novo valor diverge dele.
    function checkAndMaybeReload() {
      fetchCommit().then((commit) => {
        if (!commit) return
        if (baselineRef.current === null) {
          baselineRef.current = commit
          return
        }
        if (commit !== baselineRef.current) {
          window.location.reload()
        }
      })
    }

    checkAndMaybeReload()

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') checkAndMaybeReload()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])
}
