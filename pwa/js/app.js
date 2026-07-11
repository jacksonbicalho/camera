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
  fetchContentDays,
  fetchMotionEvents,
  fetchMoments,
  fetchRecordings,
  UnauthorizedError,
} from './api.js'
import { dateKey, relativeTime, resolveThumbUrl, anchorRecording, resolveRecordingUrl } from './format.js'
import { buildMonthGrid, WEEKDAY_LABELS } from './calendar.js'

const GRID_POLL_MS = 3000
const DETAIL_POLL_MS = 1000

const MONTH_LABELS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const views = {
  login: document.getElementById('view-login'),
  shell: document.getElementById('app-shell'),
  detail: document.getElementById('view-detail'),
  recording: document.getElementById('view-recording'),
}

const tabViews = {
  cameras: document.getElementById('view-cameras'),
  history: document.getElementById('view-history'),
  notifications: document.getElementById('view-notifications'),
  settings: document.getElementById('view-settings'),
}

const loginForm = document.getElementById('login-form')
const loginError = document.getElementById('login-error')
const cameraGrid = document.getElementById('camera-grid')
const camerasCount = document.getElementById('cameras-count')
const detailImage = document.getElementById('detail-image')
const detailTitle = document.getElementById('detail-title')
const detailBackButton = document.getElementById('detail-back-button')
const detailLiveRes = document.getElementById('detail-live-res')
const detailSnapshotButton = document.getElementById('detail-snapshot-button')
const detailFullscreenButton = document.getElementById('detail-fullscreen-button')

const tabBar = document.getElementById('tab-bar')

const historyCameraSelect = document.getElementById('history-camera-select')
const historyPrevMonth = document.getElementById('history-prev-month')
const historyNextMonth = document.getElementById('history-next-month')
const historyMonthLabel = document.getElementById('history-month-label')
const historyWeekdays = document.getElementById('history-weekdays')
const historyCalendarGrid = document.getElementById('history-calendar-grid')
const historyTimelineLabel = document.getElementById('history-timeline-label')
const historyTimeline = document.getElementById('history-timeline')

const notificationsList = document.getElementById('notifications-list')

const recordingTitle = document.getElementById('recording-title')
const recordingVideo = document.getElementById('recording-video')
const recordingBackButton = document.getElementById('recording-back-button')

const settingsServerValue = document.getElementById('settings-server-value')
const settingsLogoutButton = document.getElementById('settings-logout-button')

let session = { server: '', token: '' }
let cameras = []
let gridTimer = null
let detailTimer = null
let currentTab = 'cameras'

let historyState = { cameraId: null, cursor: new Date(), selectedKey: null, availableDays: [] }

function showView(name) {
  for (const [key, el] of Object.entries(views)) {
    el.hidden = key !== name
  }
}

function showTab(name) {
  currentTab = name
  for (const [key, el] of Object.entries(tabViews)) {
    el.hidden = key !== name
  }
  for (const button of tabBar.querySelectorAll('.tab-button')) {
    button.classList.toggle('active', button.dataset.tab === name)
  }
  if (name === 'history') openHistory()
  if (name === 'notifications') openNotifications()
  if (name === 'settings') openSettings()
}

tabBar.addEventListener('click', (event) => {
  const button = event.target.closest('.tab-button')
  if (!button) return
  showTab(button.dataset.tab)
})

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

// Câmeras

function cameraResolutionLabel(camera) {
  if (!camera.height) return ''
  return `${camera.height}p`
}

function renderGrid() {
  cameraGrid.innerHTML = ''
  camerasCount.textContent = cameras.length === 1 ? '1 câmera' : `${cameras.length} câmeras`

  for (const camera of cameras) {
    const card = document.createElement('button')
    card.className = 'camera-card'
    card.type = 'button'
    card.dataset.cameraId = camera.id

    const feed = document.createElement('div')
    feed.className = 'camera-card-feed'

    const img = document.createElement('img')
    img.alt = camera.name
    img.src = buildSnapshotUrl(session.server, camera.id, session.token)
    feed.append(img)

    const dot = document.createElement('span')
    dot.className = 'camera-card-dot'
    dot.style.background = camera.recording_enabled ? 'var(--success)' : 'var(--faint)'
    feed.append(dot)

    if (camera.motion?.enabled) {
      const badge = document.createElement('div')
      badge.className = 'camera-card-motion-badge'
      badge.innerHTML = '<span class="dot"></span><span>MOTION</span>'
      feed.append(badge)
    }

    const info = document.createElement('div')
    info.className = 'camera-card-info'
    const name = document.createElement('div')
    name.className = 'camera-card-name'
    name.textContent = camera.name
    info.append(name)
    const res = cameraResolutionLabel(camera)
    if (res) {
      const resEl = document.createElement('div')
      resEl.className = 'camera-card-res'
      resEl.textContent = res
      info.append(resEl)
    }

    card.append(feed, info)
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
  showView('shell')
  showTab('cameras')
  try {
    cameras = await fetchCameras(session.server, session.token)
  } catch (err) {
    if (err instanceof UnauthorizedError) return handleUnauthorized()
    cameraGrid.innerHTML = `<p class="error">${err.message}</p>`
    return
  }
  renderGrid()
  populateHistoryCameraSelect()
  stopPolling()
  gridTimer = setInterval(refreshGridSnapshots, GRID_POLL_MS)
}

// Ao vivo (detalhe)

function openDetail(camera) {
  stopPolling()
  showView('detail')
  detailTitle.textContent = camera.name
  detailLiveRes.textContent = cameraResolutionLabel(camera)
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

// O atributo `download` só é respeitado pelo navegador em URL same-origin —
// o servidor do PWA é tipicamente um origin diferente do `server` configurado
// (cliente externo), então um <a download href="{server}/..."> vira
// navegação normal (abre a URL) em vez de baixar. Busca o snapshot como
// blob e baixa a partir de um Object URL (sempre same-origin).
detailSnapshotButton.addEventListener('click', async () => {
  try {
    const res = await fetch(detailImage.src)
    if (!res.ok) return
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = `${(detailTitle.textContent || 'snapshot').replace(/\s+/g, '_')}.jpg`
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  } catch {
    // Falha de rede — sem fallback; o snapshot atual segue visível na tela.
  }
})

detailFullscreenButton.addEventListener('click', () => {
  const el = document.getElementById('view-detail')
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    el.requestFullscreen?.()
  }
})

// Gravação (player nativo — sem motor de player próprio)

function openRecording(moment, recordingUrl) {
  stopPolling()
  recordingTitle.textContent = `${moment.camera_name || ''} · ${relativeTime(moment.time)}`
  recordingVideo.src = recordingUrl
  showView('recording')
}

recordingBackButton.addEventListener('click', () => {
  recordingVideo.pause()
  recordingVideo.removeAttribute('src')
  recordingVideo.load()
  showView('shell')
  showTab('notifications')
})

// Histórico

function populateHistoryCameraSelect() {
  const previous = historyCameraSelect.value
  historyCameraSelect.innerHTML = ''
  for (const camera of cameras) {
    const option = document.createElement('option')
    option.value = camera.id
    option.textContent = camera.name
    historyCameraSelect.append(option)
  }
  const stillExists = cameras.some((c) => String(c.id) === previous)
  const nextId = stillExists ? previous : cameras[0]?.id
  if (nextId !== undefined) historyCameraSelect.value = nextId
  historyState.cameraId = historyCameraSelect.value || null
}

historyCameraSelect.addEventListener('change', () => {
  historyState.cameraId = historyCameraSelect.value
  loadHistoryMonth()
})

historyPrevMonth.addEventListener('click', () => {
  historyState.cursor = new Date(historyState.cursor.getFullYear(), historyState.cursor.getMonth() - 1, 1)
  loadHistoryMonth()
})

historyNextMonth.addEventListener('click', () => {
  historyState.cursor = new Date(historyState.cursor.getFullYear(), historyState.cursor.getMonth() + 1, 1)
  loadHistoryMonth()
})

function renderCalendar() {
  historyWeekdays.innerHTML = WEEKDAY_LABELS.map((d) => `<span>${d}</span>`).join('')

  const year = historyState.cursor.getFullYear()
  const month = historyState.cursor.getMonth()
  historyMonthLabel.textContent = `${MONTH_LABELS[month]} ${year}`

  const weeks = buildMonthGrid(year, month, historyState.availableDays, historyState.selectedKey)
  historyCalendarGrid.innerHTML = ''
  for (const week of weeks) {
    for (const cell of week) {
      const el = document.createElement('button')
      el.type = 'button'
      if (!cell) {
        el.className = 'calendar-day'
        el.disabled = true
        historyCalendarGrid.append(el)
        continue
      }
      el.className = `calendar-day${cell.hasContent ? ' has-content' : ''}${cell.selected ? ' selected' : ''}`
      el.textContent = String(cell.day)
      el.disabled = !cell.hasContent
      el.addEventListener('click', () => selectHistoryDay(cell.key))
      historyCalendarGrid.append(el)
    }
  }
}

function renderTimeline(events) {
  const [y, m, d] = historyState.selectedKey.split('-')
  historyTimelineLabel.textContent = `LINHA DO TEMPO · ${d}/${m}`

  historyTimeline.innerHTML = ''
  if (events.length === 0) {
    historyTimeline.innerHTML = '<p class="empty-hint">Sem eventos neste dia.</p>'
    return
  }
  for (const evt of events) {
    const row = document.createElement('div')
    row.className = 'timeline-row'

    const time = document.createElement('span')
    time.className = 'timeline-time'
    const d2 = new Date(evt.time)
    time.textContent = `${String(d2.getHours()).padStart(2, '0')}:${String(d2.getMinutes()).padStart(2, '0')}`

    const track = document.createElement('div')
    track.className = 'timeline-bar-track'
    const fill = document.createElement('div')
    fill.className = 'timeline-bar-fill'
    fill.style.width = `${Math.max(4, Math.min(100, (evt.score || 0) * 100))}%`
    track.append(fill)

    row.append(time, track)
    historyTimeline.append(row)
  }
}

async function selectHistoryDay(key) {
  historyState.selectedKey = key
  renderCalendar()
  historyTimeline.innerHTML = '<p class="empty-hint">Carregando…</p>'
  try {
    const events = await fetchMotionEvents(session.server, historyState.cameraId, key, session.token)
    renderTimeline(events)
  } catch (err) {
    if (err instanceof UnauthorizedError) return handleUnauthorized()
    historyTimeline.innerHTML = `<p class="error">${err.message}</p>`
  }
}

async function loadHistoryMonth() {
  if (!historyState.cameraId) {
    historyCalendarGrid.innerHTML = ''
    historyTimeline.innerHTML = '<p class="empty-hint">Nenhuma câmera disponível.</p>'
    return
  }
  try {
    historyState.availableDays = await fetchContentDays(session.server, historyState.cameraId, session.token, 'events')
  } catch (err) {
    if (err instanceof UnauthorizedError) return handleUnauthorized()
    historyState.availableDays = []
  }

  const monthKey = `${historyState.cursor.getFullYear()}-${String(historyState.cursor.getMonth() + 1).padStart(2, '0')}`
  const selectedInMonth = historyState.selectedKey?.startsWith(monthKey)
  if (!selectedInMonth) {
    const inMonth = historyState.availableDays.filter((k) => k.startsWith(monthKey)).sort()
    historyState.selectedKey = inMonth[inMonth.length - 1] || null
  }

  renderCalendar()

  if (historyState.selectedKey) {
    await selectHistoryDay(historyState.selectedKey)
  } else {
    historyTimelineLabel.textContent = ''
    historyTimeline.innerHTML = '<p class="empty-hint">Sem eventos neste mês.</p>'
  }
}

function openHistory() {
  if (!historyState.cameraId && cameras.length > 0) {
    historyState.cameraId = cameras[0].id
    historyCameraSelect.value = historyState.cameraId
  }
  historyState.cursor = historyState.selectedKey ? historyState.cursor : new Date()
  loadHistoryMonth()
}

// Notificações

// renderNotifications recebe `recordingsByCamera` (Map camera_id →
// gravações do dia, já buscadas) pra resolver, por momento, o link "abrir
// gravação" sem precisar de chamada de rede por linha.
function renderNotifications(moments, recordingsByCamera) {
  notificationsList.innerHTML = ''
  if (moments.length === 0) {
    notificationsList.innerHTML = '<p class="empty-hint">Nenhuma notificação hoje.</p>'
    return
  }
  for (const moment of moments) {
    const recordings = recordingsByCamera.get(String(moment.camera_id)) || []
    const recording = anchorRecording(recordings, moment.time)
    const recordingUrl = resolveRecordingUrl(session.server, recording, session.token)

    const row = document.createElement(recordingUrl ? 'button' : 'div')
    row.className = 'notification-row'
    if (recordingUrl) {
      row.type = 'button'
      row.addEventListener('click', () => openRecording(moment, recordingUrl))
    }

    const thumb = document.createElement('div')
    thumb.className = 'notification-thumb'
    const thumbUrl = resolveThumbUrl(session.server, moment, session.token)
    if (thumbUrl) {
      const img = document.createElement('img')
      img.src = thumbUrl
      img.alt = moment.camera_name || ''
      thumb.append(img)
    } else {
      thumb.innerHTML = '<span class="notification-thumb-placeholder">JPG</span>'
    }

    const info = document.createElement('div')
    info.className = 'notification-info'
    const camera = document.createElement('div')
    camera.className = 'notification-camera'
    camera.textContent = moment.camera_name || ''
    const desc = document.createElement('div')
    desc.className = 'notification-desc'
    desc.textContent = moment.label || moment.category || moment.kind || ''
    info.append(camera, desc)

    const meta = document.createElement('div')
    meta.className = 'notification-meta'
    const time = document.createElement('div')
    time.textContent = relativeTime(moment.time)
    meta.append(time)
    if (typeof moment.score === 'number') {
      const score = document.createElement('div')
      score.className = 'notification-score'
      score.textContent = moment.score.toFixed(2)
      meta.append(score)
    }

    row.append(thumb, info, meta)
    notificationsList.append(row)
  }
}

async function openNotifications() {
  notificationsList.innerHTML = '<p class="empty-hint">Carregando…</p>'
  const today = dateKey(new Date())
  try {
    const moments = await fetchMoments(session.server, today, session.token)
    const cameraIds = [...new Set(moments.map((m) => String(m.camera_id)))]
    const recordingsByCamera = new Map()
    await Promise.all(
      cameraIds.map(async (id) => {
        try {
          recordingsByCamera.set(id, await fetchRecordings(session.server, id, today, session.token))
        } catch {
          recordingsByCamera.set(id, [])
        }
      })
    )
    renderNotifications(moments, recordingsByCamera)
  } catch (err) {
    if (err instanceof UnauthorizedError) return handleUnauthorized()
    notificationsList.innerHTML = `<p class="error">${err.message}</p>`
  }
}

// Ajustes

function openSettings() {
  settingsServerValue.textContent = session.server
}

settingsLogoutButton.addEventListener('click', () => {
  stopPolling()
  clearSession()
  session = { server: '', token: '' }
  showView('login')
})

// Login

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
