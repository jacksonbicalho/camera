// Filtro de intervalo de horário (De/Até) do Histórico — HistoryPage.tsx. Compara só
// HORA:MINUTO local de cada gravação, ignorando a data (o dia já é escolhido pelo
// calendário, separadamente) — por isso um tipo próprio em vez de reusar Date inteiro.
export interface ClockTime {
  hour: number
  minute: number
}

export function clockTimeToMinutes(t: ClockTime): number {
  return t.hour * 60 + t.minute
}

// matchesTimeRange decide se o horário LOCAL de `startIso` cai dentro do intervalo
// [from, to) — comparação só de hora:minuto, a data de `startIso` é ignorada. Cada lado
// ausente vira um filtro ABERTO: só `from` → [from, 24:00) (a partir daquele horário até
// o fim do dia); só `to` → [00:00, to) (do início do dia até aquele horário); os dois
// ausentes → sempre casa (sem filtro). Não suporta mais `from > to` (intervalo cruzando a
// meia-noite) — TimeRangeFilterPanel (applyTimeRangeChange) garante from <= to antes de
// propagar, então esse estado nunca chega até aqui.
export function matchesTimeRange(
  startIso: string,
  from: ClockTime | null,
  to: ClockTime | null,
): boolean {
  if (!from && !to) return true
  const d = new Date(startIso)
  if (Number.isNaN(d.getTime())) return true
  const mins = d.getHours() * 60 + d.getMinutes()
  if (from && mins < clockTimeToMinutes(from)) return false
  if (to && mins >= clockTimeToMinutes(to)) return false
  return true
}

export type TimeRangeChangeResult =
  | { kind: 'ok'; from: ClockTime | null; to: ClockTime | null }
  | { kind: 'conflict'; resetSide: 'from' | 'to' }

// applyTimeRangeChange decide o efeito de editar um dos dois lados (`field`) do filtro de
// horário pra `value` — usado por TimeRangeFilterPanel.tsx antes de propagar `onChange`,
// garantindo que matchesTimeRange nunca receba from > to. Limpar um campo (`value = null`)
// nunca gera conflito (sempre `kind: 'ok'`) — só preencher um lado que ficaria "invertido"
// em relação ao outro já preenchido é que precisa de confirmação do usuário
// (TimeRangeFilterPanel abre um ConfirmDialog perguntando se zera `resetSide`).
export function applyTimeRangeChange(
  current: { from: ClockTime | null; to: ClockTime | null },
  field: 'from' | 'to',
  value: ClockTime | null,
): TimeRangeChangeResult {
  if (field === 'from') {
    if (value && current.to && clockTimeToMinutes(value) > clockTimeToMinutes(current.to)) {
      return { kind: 'conflict', resetSide: 'to' }
    }
    return { kind: 'ok', from: value, to: current.to }
  }
  if (value && current.from && clockTimeToMinutes(value) < clockTimeToMinutes(current.from)) {
    return { kind: 'conflict', resetSide: 'from' }
  }
  return { kind: 'ok', from: current.from, to: value }
}
