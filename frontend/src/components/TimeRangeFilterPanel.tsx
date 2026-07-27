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

// PICKER_SX normaliza altura/fonte/cor do TimePicker (MUI) pra bater com as OUTRAS 2
// linhas da coluna lateral (botão do DatePicker, `size="sm"` do design system →
// h-8/32px/text-xs/bg-surface-2/border-border; `<select>` do dropdown de categoria, mesma
// fonte text-caption/12px + bg-surface-2/border-border) — sem isso, o tamanho "small"
// default do MUI (~40px de altura, fonte maior) E a cor/borda default do Material Design
// destoam das outras duas linhas, quebrando a proporção/estilo visual entre elas (pedido
// do navigator, testado contra a página renderizada de verdade). Cores via `var(--color-
// *)` (não hex cru) pra acompanhar automaticamente dark/light — os mesmos tokens que
// `bg-surface-2`/`border-border`/`text-foreground` resolvem via Tailwind.
//
// Seletores `MuiPickers*` (não `MuiInputBase-root`/`MuiOutlinedInput-notchedOutline`, os
// nomes "genéricos" do `@mui/material` TextField comum): a partir do MUI X v7,
// TimePicker/DatePicker usam a "accessible field DOM structure" própria do
// `@mui/x-date-pickers`, com classes prefixadas `MuiPickers*` em vez das classes padrão
// do `@mui/material` — confirmado inspecionando o DOM renderizado de verdade (não só a
// doc) contra a versão instalada (`@mui/x-date-pickers@9.10.1`). Usar os seletores
// "genéricos" (bug já cometido e corrigido numa iteração anterior deste mesmo arquivo)
// simplesmente não bate com nada no DOM real — `sx` silenciosamente vira no-op, sem erro
// nenhum em lint/build/teste.
const PICKER_SX = {
  flex: 1,
  '& .MuiPickersInputBase-root': {
    height: 32,
    fontSize: '0.75rem',
    color: 'var(--color-foreground)',
    backgroundColor: 'var(--color-surface-2)',
    borderRadius: '0.375rem',
  },
  '& .MuiPickersOutlinedInput-notchedOutline': { borderColor: 'var(--color-border)' },
  '& .MuiInputLabel-root': { fontSize: '0.75rem', color: 'var(--color-muted)' },
}

// TimeRangeFilterPanel — painel de filtro de horário do Histórico (linha própria, cheia,
// na coluna lateral — ver HistoryPage.tsx): dois TimePicker (MUI X) com dial de relógio
// (viewRenderers com hours+minutes, em vez do relógio digital padrão — pedido do
// navigator, mockup em work_progress/amostras/image.png; hours+minutes = o dial captura
// hora E minuto, não só hora). Sem `label` visível (removido a pedido do navigator,
// testado contra a página real — os dois picker lado a lado já deixam "de/até" óbvio
// visualmente, o texto flutuante do MUI ficava redundante nessa coluna estreita) — mas o
// `aria-label` "De"/"Até" continua explícito em cada `slotProps.textField`, preservando a
// distinção pra leitor de tela mesmo sem o rótulo visual. `flex-1` em vez de largura
// fixa — a linha é só dele agora (não divide mais espaço com o `DatePicker`, que ganhou
// linha própria acima), então os dois picker esticam pra usar a largura toda disponível.
// Filtra AO VIVO: sem botão "Aplicar"
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
            value={clockTimeToDate(from)}
            onChange={(d) => onChange(dateToClockTime(d), to)}
            viewRenderers={{ hours: renderTimeViewClock, minutes: renderTimeViewClock }}
            ampm={false}
            slotProps={{
              textField: { id: 'history-time-range-from', size: 'small', 'aria-label': 'De' },
            }}
            sx={PICKER_SX}
          />
          <TimePicker
            value={clockTimeToDate(to)}
            onChange={(d) => onChange(from, dateToClockTime(d))}
            viewRenderers={{ hours: renderTimeViewClock, minutes: renderTimeViewClock }}
            ampm={false}
            slotProps={{
              textField: { id: 'history-time-range-to', size: 'small', 'aria-label': 'Até' },
            }}
            sx={PICKER_SX}
          />
        </div>
      </LocalizationProvider>
    </MuiThemeProvider>
  )
}
