import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { TimePicker } from '@mui/x-date-pickers/TimePicker'
import { renderTimeViewClock } from '@mui/x-date-pickers/timeViewRenderers'
import MuiThemeProvider from './MuiThemeProvider'
import type { ClockTime } from '../lib/timeRange'

// clockTimeToDate/dateToClockTime convertem entre o tipo próprio do app (ClockTime, só
// hora:minuto, sem data — ver lib/timeRange.ts) e o Date que o TimePicker do MUI espera.
// A DATA em si (dia/mês/ano) do Date intermediário é irrelevante — só hora/minuto importam.
function clockTimeToDate(t: ClockTime | null): Date | null {
  if (!t) return null
  const d = new Date()
  d.setHours(t.hour, t.minute, 0, 0)
  return d
}

function dateToClockTime(d: Date | null): ClockTime | null {
  if (!d || Number.isNaN(d.getTime())) return null
  return { hour: d.getHours(), minute: d.getMinutes() }
}

export interface TimeRangeFilterPanelProps {
  from: ClockTime | null
  to: ClockTime | null
  onChange: (from: ClockTime | null, to: ClockTime | null) => void
}

// TimeRangeFilterPanel — painel de filtro de horário do Histórico (linha própria, cheia,
// na coluna lateral — ver HistoryPage.tsx): dois TimePicker (MUI X) com dial de relógio
// (viewRenderers com hours+minutes, em vez do relógio digital padrão — pedido do
// navigator, mockup em work_progress/amostras/image.png; hours+minutes = o dial captura
// hora E minuto, não só hora). Sem label textual solto (o rótulo "De"/"Até" de cada
// TimePicker já basta); `flex-1` em vez de largura fixa — a linha é só dele agora (não
// divide mais espaço com o `DatePicker`, que ganhou linha própria acima), então os dois
// picker esticam pra usar a largura toda disponível. Filtra AO VIVO: sem botão "Aplicar"
// — cada edição já chama `onChange`, que o HistoryPage aplica direto (mesmo contrato que
// lib/timeRange.ts's matchesTimeRange usa pra "filtro incompleto = sem filtro": com só um
// dos dois horários preenchido, o filtro ainda não entra em vigor, mas não exige clique
// nenhum pra valer assim que o segundo for preenchido).
export default function TimeRangeFilterPanel({ from, to, onChange }: TimeRangeFilterPanelProps) {
  return (
    <MuiThemeProvider>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <div id="history-time-range-filter" className="flex w-full items-center gap-1">
          <TimePicker
            label="De"
            value={clockTimeToDate(from)}
            onChange={(d) => onChange(dateToClockTime(d), to)}
            viewRenderers={{ hours: renderTimeViewClock, minutes: renderTimeViewClock }}
            ampm={false}
            slotProps={{ textField: { id: 'history-time-range-from', size: 'small' } }}
            sx={{ flex: 1 }}
          />
          <TimePicker
            label="Até"
            value={clockTimeToDate(to)}
            onChange={(d) => onChange(from, dateToClockTime(d))}
            viewRenderers={{ hours: renderTimeViewClock, minutes: renderTimeViewClock }}
            ampm={false}
            slotProps={{ textField: { id: 'history-time-range-to', size: 'small' } }}
            sx={{ flex: 1 }}
          />
        </div>
      </LocalizationProvider>
    </MuiThemeProvider>
  )
}
