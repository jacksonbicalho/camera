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
  onApply: (from: ClockTime, to: ClockTime) => void
}

// TimeRangeFilterPanel — painel "Filtro de Range de Tempo" do Histórico (topo da página,
// ver HistoryPage.tsx): dois TimePicker (MUI X) com dial de relógio (viewRenderers, em vez
// do relógio digital padrão — pedido do navigator, mockup em work_progress/amostras/
// image.png) + botão "Aplicar". Controlado: `onChange` reflete cada edição de horário
// (De/Até independentes); `onApply` só é chamado com os dois horários definidos — o botão
// fica desabilitado até lá, mesmo contrato que lib/timeRange.ts's matchesTimeRange usa pra
// "filtro incompleto = sem filtro" (o filtro só passa a valer depois de Aplicar).
export default function TimeRangeFilterPanel({
  from,
  to,
  onChange,
  onApply,
}: TimeRangeFilterPanelProps) {
  return (
    <MuiThemeProvider>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <div id="history-time-range-filter" className="flex items-center gap-2">
          <span className="text-caption text-muted whitespace-nowrap">
            Filtro de Range de Tempo
          </span>
          <TimePicker
            label="De"
            value={clockTimeToDate(from)}
            onChange={(d) => onChange(dateToClockTime(d), to)}
            viewRenderers={{ hours: renderTimeViewClock, minutes: renderTimeViewClock }}
            ampm={false}
            slotProps={{ textField: { id: 'history-time-range-from', size: 'small' } }}
          />
          <TimePicker
            label="Até"
            value={clockTimeToDate(to)}
            onChange={(d) => onChange(from, dateToClockTime(d))}
            viewRenderers={{ hours: renderTimeViewClock, minutes: renderTimeViewClock }}
            ampm={false}
            slotProps={{ textField: { id: 'history-time-range-to', size: 'small' } }}
          />
          <button
            id="history-time-range-apply"
            type="button"
            disabled={!from || !to}
            onClick={() => {
              if (from && to) onApply(from, to)
            }}
            className="rounded bg-primary px-3 py-1.5 text-caption text-on-primary disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
      </LocalizationProvider>
    </MuiThemeProvider>
  )
}
