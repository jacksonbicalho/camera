import {
  normalizeServerUrl,
  getServer,
  getToken,
  setSession,
  clearSession,
  mustChangePassword,
  buildSnapshotUrl,
  login,
  fetchCameras,
  UnauthorizedError,
} from './api.js'

const GRID_POLL_MS = 3000
const DETAIL_POLL_MS = 1000

const views = {
  login: document.getElementById('view-login'),
  grid: document.getElementById('view-grid'),
  detail: document.getElementById('view-detail'),
}

const loginForm = document.getElementById('login-form')
const loginError = document.getElementById('login-error')
const cameraGrid = document.getElementById('camera-grid')
const logoutButton = document.getElementById('logout-button')
const detailImage = document.getElementById('detail-image')
const detailTitle = document.getElementById('detail-title')
const detailBackButton = document.getElementById('detail-back-button')

let session = { server: '', token: '' }
let cameras = []
let gridTimer = null
let detailTimer = null

function showView(name) {
  for (const [key, el] of Object.entries(views)) {
    el.hidden = key !== name
  }
}

function stopPolling() {
  if (gridTimer) clearInterval(gridTimer)
  if (detailTimer) clearInterval(detailTimer)
  gridTimer = null
  detailTimer = null
}

function handleUnauthorized() {
  stopPolling()
  clearSession()
  session = { server: '', token: '' }
  loginError.textContent = 'Sessão expirada — faça login novamente.'
  showView('login')
}

function renderGrid() {
  cameraGrid.innerHTML = ''
  for (const camera of cameras) {
    const card = document.createElement('button')
    card.className = 'camera-card'
    card.type = 'button'
    card.dataset.cameraId = camera.id

    const img = document.createElement('img')
    img.alt = camera.name
    img.src = buildSnapshotUrl(session.server, camera.id, session.token)

    const label = document.createElement('span')
    label.className = 'camera-card-name'
    label.textContent = camera.name

    card.append(img, label)
    card.addEventListener('click', () => openDetail(camera))
    cameraGrid.append(card)
  }
}

function refreshGridSnapshots() {
  for (const img of cameraGrid.querySelectorAll('img')) {
    const cameraId = img.closest('.camera-card').dataset.cameraId
    img.src = buildSnapshotUrl(session.server, cameraId, session.token)
  }
}

async function openGrid() {
  showView('grid')
  try {
    cameras = await fetchCameras(session.server, session.token)
  } catch (err) {
    if (err instanceof UnauthorizedError) return handleUnauthorized()
    cameraGrid.innerHTML = `<p class="error">${err.message}</p>`
    return
  }
  renderGrid()
  stopPolling()
  gridTimer = setInterval(refreshGridSnapshots, GRID_POLL_MS)
}

function openDetail(camera) {
  stopPolling()
  showView('detail')
  detailTitle.textContent = camera.name
  const refresh = () => {
    detailImage.src = buildSnapshotUrl(session.server, camera.id, session.token)
  }
  refresh()
  detailTimer = setInterval(refresh, DETAIL_POLL_MS)
}

detailBackButton.addEventListener('click', () => {
  stopPolling()
  openGrid()
})

logoutButton.addEventListener('click', () => {
  stopPolling()
  clearSession()
  session = { server: '', token: '' }
  showView('login')
})

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  loginError.textContent = ''

  const server = normalizeServerUrl(loginForm.elements.server.value)
  const username = loginForm.elements.username.value.trim()
  const password = loginForm.elements.password.value

  if (!server) {
    loginError.textContent = 'Informe o endereço do servidor.'
    return
  }

  try {
    const token = await login(server, username, password)
    if (mustChangePassword(token)) {
      loginError.textContent = 'Troque sua senha pelo app web antes de usar o PWA.'
      return
    }
    setSession(server, token)
    session = { server, token }
    loginForm.elements.password.value = ''
    await openGrid()
  } catch {
    loginError.textContent = 'Não foi possível entrar — verifique servidor, usuário e senha.'
  }
})

function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  }

  const server = getServer()
  const token = getToken()
  if (server && token) {
    session = { server, token }
    loginForm.elements.server.value = server
    openGrid()
  } else {
    showView('login')
  }
}

init()
