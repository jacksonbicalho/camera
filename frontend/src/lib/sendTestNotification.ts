import { authHeaders, onUnauthorized } from '../auth'

// sendTestNotification — POST comum aos 2 endpoints de teste de notificação
// (/api/me/telegram/test, /api/me/push/test): 200 = ok, qualquer outro
// status lê o corpo text/plain (convenção do projeto, http.Error no
// backend — nunca um envelope JSON) como mensagem de erro.
export async function sendTestNotification(path: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(path, { method: 'POST', headers: authHeaders() })
  if (res.status === 401) {
    onUnauthorized()
    return { ok: false, error: 'não autorizado' }
  }
  if (res.ok) return { ok: true }
  const text = (await res.text()).trim()
  return { ok: false, error: text || 'Falha ao enviar a notificação de teste.' }
}
