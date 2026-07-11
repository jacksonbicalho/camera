import test from 'node:test'
import assert from 'node:assert/strict'
import { dateKey, relativeTime, resolveThumbUrl, anchorRecording, resolveRecordingUrl } from './format.js'

test('dateKey formata yyyy-MM-dd no fuso local', () => {
  assert.equal(dateKey(new Date(2026, 6, 1)), '2026-07-01')
  assert.equal(dateKey(new Date(2026, 0, 9)), '2026-01-09')
})

test('relativeTime: menos de 1 minuto', () => {
  const now = new Date('2026-07-11T12:00:00')
  const iso = new Date('2026-07-11T11:59:30').toISOString()
  assert.equal(relativeTime(iso, now), 'agora')
})

test('relativeTime: minutos atrás', () => {
  const now = new Date('2026-07-11T12:00:00')
  const iso = new Date('2026-07-11T11:45:00').toISOString()
  assert.equal(relativeTime(iso, now), 'há 15 min')
})

test('relativeTime: horas atrás, mesmo dia', () => {
  const now = new Date('2026-07-11T12:00:00')
  const iso = new Date('2026-07-11T09:00:00').toISOString()
  assert.equal(relativeTime(iso, now), 'há 3 h')
})

test('relativeTime: ontem', () => {
  const now = new Date('2026-07-11T12:00:00')
  const iso = new Date('2026-07-10T08:05:00').toISOString()
  assert.equal(relativeTime(iso, now), 'ontem, 08:05')
})

test('relativeTime: mais antigo que ontem', () => {
  const now = new Date('2026-07-11T12:00:00')
  const iso = new Date('2026-07-05T08:05:00').toISOString()
  assert.equal(relativeTime(iso, now), '05/07, 08:05')
})

test('resolveThumbUrl: sem frame retorna null', () => {
  assert.equal(resolveThumbUrl('http://srv', { frame: '' }, 'tok'), null)
  assert.equal(resolveThumbUrl('http://srv', {}, 'tok'), null)
})

test('resolveThumbUrl: frame absoluto', () => {
  const url = resolveThumbUrl('http://srv:8080', { frame: '/recordings/x.jpg' }, 'tok')
  assert.equal(url, 'http://srv:8080/recordings/x.jpg?token=tok')
})

test('resolveThumbUrl: frame relativo monta caminho por camera/data UTC', () => {
  const moment = { frame: 'evt_123.jpg', camera_id: 'cam1', time: '2026-07-11T02:30:00Z' }
  const url = resolveThumbUrl('http://srv:8080', moment, 'tok')
  assert.equal(url, 'http://srv:8080/recordings/cam1/2026/07/11/evt_123.jpg?token=tok')
})

test('anchorRecording: sem gravações retorna null', () => {
  assert.equal(anchorRecording([], '2026-07-11T12:00:00Z'), null)
  assert.equal(anchorRecording(undefined, '2026-07-11T12:00:00Z'), null)
})

test('anchorRecording: escolhe a última gravação que começou antes do instante', () => {
  const recordings = [
    { id: 1, start: '2026-07-11T10:00:00Z' },
    { id: 2, start: '2026-07-11T11:00:00Z' },
    { id: 3, start: '2026-07-11T12:00:00Z' },
  ]
  const rec = anchorRecording(recordings, '2026-07-11T11:30:00Z')
  assert.equal(rec.id, 2)
})

test('anchorRecording: instante antes de todas as gravações usa a primeira do dia', () => {
  const recordings = [
    { id: 2, start: '2026-07-11T11:00:00Z' },
    { id: 1, start: '2026-07-11T10:00:00Z' },
  ]
  const rec = anchorRecording(recordings, '2026-07-11T05:00:00Z')
  assert.equal(rec.id, 1)
})

test('resolveRecordingUrl: monta URL a partir do campo url da gravação', () => {
  const url = resolveRecordingUrl('http://srv:8080', { url: '/recordings/cam1/2026/07/11/x.mp4' }, 'tok')
  assert.equal(url, 'http://srv:8080/recordings/cam1/2026/07/11/x.mp4?token=tok')
})

test('resolveRecordingUrl: sem gravação retorna null', () => {
  assert.equal(resolveRecordingUrl('http://srv', null, 'tok'), null)
  assert.equal(resolveRecordingUrl('http://srv', {}, 'tok'), null)
})
