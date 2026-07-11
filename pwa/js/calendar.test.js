import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMonthGrid } from './calendar.js'

test('buildMonthGrid: julho 2026 começa numa quarta (padding no início, semana começa segunda)', () => {
  const weeks = buildMonthGrid(2026, 6, [], null)
  assert.equal(weeks[0][0], null)
  assert.equal(weeks[0][1], null)
  assert.equal(weeks[0][2].day, 1)
  assert.equal(weeks[0][2].key, '2026-07-01')
})

test('buildMonthGrid: todas as semanas têm 7 colunas', () => {
  const weeks = buildMonthGrid(2026, 6, [], null)
  for (const week of weeks) assert.equal(week.length, 7)
})

test('buildMonthGrid: marca hasContent a partir de availableDays', () => {
  const weeks = buildMonthGrid(2026, 6, ['2026-07-11', '2026-07-05'], null)
  const flat = weeks.flat().filter(Boolean)
  const day11 = flat.find((c) => c.day === 11)
  const day10 = flat.find((c) => c.day === 10)
  assert.equal(day11.hasContent, true)
  assert.equal(day10.hasContent, false)
})

test('buildMonthGrid: marca selected a partir de selectedKey', () => {
  const weeks = buildMonthGrid(2026, 6, [], '2026-07-11')
  const flat = weeks.flat().filter(Boolean)
  const selected = flat.filter((c) => c.selected)
  assert.equal(selected.length, 1)
  assert.equal(selected[0].day, 11)
})

test('buildMonthGrid: aceita Set em availableDays', () => {
  const weeks = buildMonthGrid(2026, 6, new Set(['2026-07-01']), null)
  const flat = weeks.flat().filter(Boolean)
  assert.equal(flat.find((c) => c.day === 1).hasContent, true)
})
