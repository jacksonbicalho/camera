// Cliente puro da API REST do os-camera (api/openapi.yaml). Sem dependências,
// sem bundler — roda como módulo ES nativo direto no browser.

const STORAGE_KEYS = { server: 'pwa_server', token: 'pwa_token' }

export class UnauthorizedError extends Error {
  constructor() {
    super('sessão expirada ou inválida')
  }
}

export function normalizeServerUrl(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  return withScheme.replace(/\/+$/, '')
}

export function getServer() {
  return localStorage.getItem(STORAGE_KEYS.server) || ''
}

export function getToken() {
  return localStorage.getItem(STORAGE_KEYS.token) || ''
}

export function setSession(server, token) {
  localStorage.setItem(STORAGE_KEYS.server, server)
  localStorage.setItem(STORAGE_KEYS.token, token)
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.server)
  localStorage.removeItem(STORAGE_KEYS.token)
}

export function decodeJwt(token) {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

export function mustChangePassword(token) {
  const claims = decodeJwt(token)
  return claims?.must_change_password === true
}

export function buildSnapshotUrl(server, cameraId, token) {
  return `${server}/api/cameras/${encodeURIComponent(cameraId)}/snapshot?token=${encodeURIComponent(token)}&_=${Date.now()}`
}

export async function login(server, username, password) {
  const res = await fetch(`${server}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error('Credenciais inválidas')
  const data = await res.json()
  return data.token
}

export async function fetchCameras(server, token) {
  const res = await fetch(`${server}/api/cameras`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error('Falha ao carregar câmeras')
  return res.json()
}
