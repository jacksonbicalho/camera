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

// fetchContentDays devolve as datas (yyyy-MM-dd) com conteúdo de uma câmera,
// pro calendário da tela Histórico. `kind` segue o mesmo contrato do backend
// (recordings|events|all).
export async function fetchContentDays(server, cameraId, token, kind = 'events') {
  const res = await fetch(
    `${server}/api/cameras/${encodeURIComponent(cameraId)}/content-days?kind=${encodeURIComponent(kind)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error('Falha ao carregar dias com conteúdo')
  const data = await res.json()
  return data.days || []
}

// fetchMotionEvents devolve a timeline de eventos de movimento de uma câmera
// num dia (yyyy-MM-dd), pra tela Histórico.
export async function fetchMotionEvents(server, cameraId, date, token) {
  const res = await fetch(
    `${server}/api/cameras/${encodeURIComponent(cameraId)}/motion?date=${encodeURIComponent(date)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error('Falha ao carregar eventos de movimento')
  const data = await res.json()
  return data.events || []
}

// fetchRecordings devolve as gravações (chunks MP4) de uma câmera num dia
// (yyyy-MM-dd), pra resolver o link "executar gravação" da tela
// Notificações. `limit=0` pede todas as gravações do dia (sem paginação).
export async function fetchRecordings(server, cameraId, date, token) {
  const res = await fetch(
    `${server}/api/cameras/${encodeURIComponent(cameraId)}/recordings?date=${encodeURIComponent(date)}&limit=0&order=asc`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error('Falha ao carregar gravações')
  const data = await res.json()
  return data.recordings || []
}

// fetchMoments devolve o feed unificado (movimento/pessoa/ia/estados) de
// todas as câmeras acessíveis num dia (yyyy-MM-dd), pra tela Notificações.
// `date` é obrigatório (o backend responde 400 sem ele).
export async function fetchMoments(server, date, token) {
  const res = await fetch(`${server}/api/moments?date=${encodeURIComponent(date)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error('Falha ao carregar notificações')
  const data = await res.json()
  return data.moments || []
}
