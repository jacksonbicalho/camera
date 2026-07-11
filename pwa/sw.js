const CACHE_NAME = 'os-camera-pwa-v3'
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/api.js',
  './js/app.js',
  './js/calendar.js',
  './js/format.js',
  './icons/icon.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  )
  self.clients.claim()
})

// Só cacheia o app shell (mesmo origin). Chamadas de API e snapshots vão
// direto pra rede, sempre — dado de câmera não pode vir de cache.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)))
})
