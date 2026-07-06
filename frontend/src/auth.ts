const TOKEN_KEY = 'camera_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
}

// remember=true (default, "Lembrar de mim" marcado) persiste em localStorage,
// sobrevivendo a fechar o browser (comportamento atual). remember=false usa
// sessionStorage — o token some ao fechar a aba/browser, mesmo JWT/expiração.
export function setToken(token: string, remember = true): void {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    sessionStorage.setItem(TOKEN_KEY, token)
  }
  window.dispatchEvent(new Event('camera:token-changed'))
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
}

export function onUnauthorized(): void {
  clearToken()
  window.dispatchEvent(new CustomEvent('camera:unauthorized'))
}

export async function login(username: string, password: string, remember = true): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error('Credenciais inválidas')
  const data = await res.json()
  setToken(data.token, remember)
}

export function getUsername(): string | null {
  const token = getToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

export function getRole(): string | null {
  const token = getToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

export function mustChangePassword(): boolean {
  const token = getToken()
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.must_change_password === true
  } catch {
    return false
  }
}

export async function changePassword(newPassword: string): Promise<void> {
  const token = getToken()
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password: newPassword }),
  })
  if (!res.ok) throw new Error('Falha ao alterar senha')
}

export function authHeaders(): HeadersInit {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
