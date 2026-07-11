import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchContentDays, fetchMotionEvents, fetchMoments, fetchRecordings, UnauthorizedError } from './api.js'

function fakeFetch(status, body) {
  const calls = []
  const fn = async (url, opts) => {
    calls.push({ url, opts })
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    }
  }
  fn.calls = calls
  return fn
}

test('fetchContentDays: monta URL com kind e devolve days', async () => {
  globalThis.fetch = fakeFetch(200, { days: ['2026-07-01', '2026-07-11'] })
  const days = await fetchContentDays('http://srv', 'cam1', 'tok', 'events')
  assert.deepEqual(days, ['2026-07-01', '2026-07-11'])
  assert.equal(globalThis.fetch.calls[0].url, 'http://srv/api/cameras/cam1/content-days?kind=events')
  assert.equal(globalThis.fetch.calls[0].opts.headers.Authorization, 'Bearer tok')
})

test('fetchContentDays: sem days no corpo devolve array vazio', async () => {
  globalThis.fetch = fakeFetch(200, {})
  const days = await fetchContentDays('http://srv', 'cam1', 'tok')
  assert.deepEqual(days, [])
})

test('fetchContentDays: 401 lança UnauthorizedError', async () => {
  globalThis.fetch = fakeFetch(401, {})
  await assert.rejects(() => fetchContentDays('http://srv', 'cam1', 'tok'), UnauthorizedError)
})

test('fetchMotionEvents: monta URL com date e devolve events', async () => {
  globalThis.fetch = fakeFetch(200, { events: [{ id: 1, score: 0.4 }] })
  const events = await fetchMotionEvents('http://srv', 'cam1', '2026-07-11', 'tok')
  assert.deepEqual(events, [{ id: 1, score: 0.4 }])
  assert.equal(globalThis.fetch.calls[0].url, 'http://srv/api/cameras/cam1/motion?date=2026-07-11')
})

test('fetchMoments: monta URL com date e devolve moments', async () => {
  globalThis.fetch = fakeFetch(200, { moments: [{ camera_id: 'cam1', kind: 'motion' }], total: 1, hasMore: false })
  const moments = await fetchMoments('http://srv', '2026-07-11', 'tok')
  assert.deepEqual(moments, [{ camera_id: 'cam1', kind: 'motion' }])
  assert.equal(globalThis.fetch.calls[0].url, 'http://srv/api/moments?date=2026-07-11')
})

test('fetchMoments: erro não-ok lança', async () => {
  globalThis.fetch = fakeFetch(400, {})
  await assert.rejects(() => fetchMoments('http://srv', '', 'tok'))
})

test('fetchRecordings: monta URL com date/limit/order e devolve recordings', async () => {
  globalThis.fetch = fakeFetch(200, { recordings: [{ id: 1, url: '/recordings/cam1/x.mp4' }], hasMore: false, total: 1 })
  const recordings = await fetchRecordings('http://srv', 'cam1', '2026-07-11', 'tok')
  assert.deepEqual(recordings, [{ id: 1, url: '/recordings/cam1/x.mp4' }])
  assert.equal(
    globalThis.fetch.calls[0].url,
    'http://srv/api/cameras/cam1/recordings?date=2026-07-11&limit=0&order=asc'
  )
})

test('fetchRecordings: sem recordings no corpo devolve array vazio', async () => {
  globalThis.fetch = fakeFetch(200, {})
  const recordings = await fetchRecordings('http://srv', 'cam1', '2026-07-11', 'tok')
  assert.deepEqual(recordings, [])
})

test('fetchRecordings: 401 lança UnauthorizedError', async () => {
  globalThis.fetch = fakeFetch(401, {})
  await assert.rejects(() => fetchRecordings('http://srv', 'cam1', '2026-07-11', 'tok'), UnauthorizedError)
})
