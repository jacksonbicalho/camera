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
// [from, to) — comparação só de hora:minuto, a data de `startIso` é ignorada. `from`/`to`
// ausentes (filtro incompleto, ex. usuário só preencheu um dos dois) sempre casa — o
// filtro só entra em vigor com os dois lados definidos (mesmo contrato do botão
// "Aplicar" do TimeRangeFilterPanel, que fica desabilitado até então). Suporta um
// intervalo que CRUZA A MEIA-NOITE (from > to, ex.: 22:00–02:00): nesse caso o intervalo
// "por fora" é [from, 24:00) ∪ [00:00, to), então o teste de containment inverte pra OR
// em vez de AND.
export function matchesTimeRange(
  startIso: string,
  from: ClockTime | null,
  to: ClockTime | null,
): boolean {
  if (!from || !to) return true
  const d = new Date(startIso)
  if (Number.isNaN(d.getTime())) return true
  const mins = d.getHours() * 60 + d.getMinutes()
  const fromMins = clockTimeToMinutes(from)
  const toMins = clockTimeToMinutes(to)
  if (fromMins <= toMins) return mins >= fromMins && mins < toMins
  return mins >= fromMins || mins < toMins
}
