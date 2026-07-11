// Construção pura do grid do mês (calendário de Histórico) — sem DOM.

import { dateKey } from './format.js'

// Segunda a domingo — mesma ordem/rótulos do mockup.
export const WEEKDAY_LABELS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']

// buildMonthGrid monta as semanas (7 colunas, segunda-feira primeiro —
// mesma ordem do mockup: S T Q Q S S D) de um mês. `month` é 0-indexado
// (convenção de Date). Cada célula é `{ day, key, hasContent, selected }`
// ou `null` (padding fora do mês). `availableDays` é um array/Set de
// chaves yyyy-MM-dd com conteúdo.
export function buildMonthGrid(year, month, availableDays, selectedKey) {
  const availableSet = availableDays instanceof Set ? availableDays : new Set(availableDays)
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(new Date(year, month, day))
    cells.push({ day, key, hasContent: availableSet.has(key), selected: key === selectedKey })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}
