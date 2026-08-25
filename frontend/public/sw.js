// Service Worker mínimo — só existe pra receber eventos `push` com o app
// fechado/em background e mostrar a notificação do SO. Não intercepta
// `fetch` nem faz cache de nada (história feat/web-push-notificacoes-
// movimento) — o app já resolve "sempre carregar o build mais novo" de
// outro jeito (useForceReloadOnStaleBuild, história separada), então este
// SW deliberadamente não reabre essa discussão de staleness de conteúdo.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // Payload não é JSON (não deveria acontecer — o backend sempre manda
    // {title, body, link}) — mostra algo em vez de falhar em silêncio.
  }
  const title = data.title || 'os-camera'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      tag: data.link || undefined,
      data: { link: data.link || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = event.notification.data && event.notification.data.link
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus()
          if (link && 'navigate' in client) client.navigate(link)
          return
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link || '/')
    }),
  )
})
