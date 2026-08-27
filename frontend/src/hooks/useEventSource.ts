import { useEffect } from 'react'
import { getToken } from '../auth'

export interface UseEventSourceOptions {
  // onOpen dispara em toda conexão bem-sucedida — inclusive numa reconexão
  // automática do EventSource após onError, o que o UpdateProgressModal usa
  // pra detectar "servidor voltou a responder" depois da queda esperada no
  // reexec da auto-atualização.
  onOpen?: () => void
  onError?: () => void
}

export function useEventSource(
  path: string | null,
  onMessage: (data: string) => void,
  options?: UseEventSourceOptions,
) {
  const { onOpen, onError } = options ?? {}
  useEffect(() => {
    if (!path) return
    const token = getToken()
    if (!token) return

    const sep = path.includes('?') ? '&' : '?'
    const es = new EventSource(`${path}${sep}token=${encodeURIComponent(token)}`)
    es.onmessage = (e) => onMessage(e.data)
    if (onOpen) es.onopen = onOpen
    if (onError) es.onerror = onError
    return () => es.close()
  }, [path, onMessage, onOpen, onError])
}
