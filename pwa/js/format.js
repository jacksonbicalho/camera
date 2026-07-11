// Lógica pura de formatação — sem DOM, testável direto via node:test.

// dateKey formata uma Date como yyyy-MM-dd no fuso local (mesma convenção de
// frontend/src/lib/calendar.ts) — chave usada para casar com os dias com
// conteúdo devolvidos por /content-days.
export function dateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function pad(n) {
  return String(n).padStart(2, '0')
}

// relativeTime formata um timestamp ISO relativo a `now`: "agora" (<1min),
// "há N min" (<1h), "há N h" (mesmo dia local), "ontem, HH:mm" (dia local
// anterior) ou "DD/MM, HH:mm" (mais antigo).
export function relativeTime(iso, now = new Date()) {
  const date = new Date(iso)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `há ${diffMin} min`

  const sameDay = dateKey(date) === dateKey(now)
  if (sameDay) {
    const diffH = Math.floor(diffMin / 60)
    return `há ${diffH} h`
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const hhmm = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (dateKey(date) === dateKey(yesterday)) {
    return `ontem, ${hhmm}`
  }

  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}, ${hhmm}`
}

// resolveThumbUrl monta a URL de thumbnail de um Moment/MotionEvent (campo
// `frame`), prefixada pelo `server` configurado (cliente externo). Mesmo
// padrão de frontend/src/pages/RecordingsPage.tsx (momentThumb): `frame`
// absoluto (começa com "/") é usado direto; senão monta o caminho por baixo
// de /recordings/{camera_id}/{YYYY/MM/DD do UTC de `time`}/{frame}.
export function resolveThumbUrl(server, moment, token) {
  if (!moment.frame) return null
  const tokenParam = `token=${encodeURIComponent(token)}`
  if (moment.frame.startsWith('/')) {
    return `${server}${moment.frame}?${tokenParam}`
  }
  const d = new Date(moment.time)
  const dir = `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`
  return `${server}/recordings/${encodeURIComponent(moment.camera_id)}/${dir}/${moment.frame}?${tokenParam}`
}

// anchorRecording escolhe, entre as gravações (chunks MP4) de um dia, a que
// contém (ou antecede mais de perto) um instante — mesmo critério de
// frontend/src/lib/eventNavigation.ts (anchorRecording): a última que
// começou antes/no instante, ou a primeira do dia se o instante for anterior
// a todas. `null` sem gravações.
export function anchorRecording(recordings, isoTime) {
  if (!recordings || recordings.length === 0) return null
  const t = new Date(isoTime).getTime()
  const asc = [...recordings].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  let candidate = null
  for (const r of asc) {
    if (new Date(r.start).getTime() <= t) candidate = r
    else break
  }
  return candidate ?? asc[0]
}

// resolveRecordingUrl monta a URL de reprodução direta de uma gravação
// (campo `url`, já um caminho completo sob /recordings/ devolvido pelo
// backend) — sem motor de player: o link abre o MP4 e o navegador toca
// nativamente.
export function resolveRecordingUrl(server, recording, token) {
  if (!recording?.url) return null
  return `${server}${recording.url}?token=${encodeURIComponent(token)}`
}
