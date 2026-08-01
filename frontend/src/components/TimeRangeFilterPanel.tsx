import { useState } from 'react'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { TimePicker } from '@mui/x-date-pickers/TimePicker'
import { renderTimeViewClock } from '@mui/x-date-pickers/timeViewRenderers'
import MuiThemeProvider from './MuiThemeProvider'
import ConfirmDialog from './ConfirmDialog'
import { applyTimeRangeChange, type ClockTime } from '../lib/timeRange'

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
// Filtra AO VIVO: sem botão "Aplicar" — cada seleção COMPLETA (hora + minuto) sem conflito
// já chama `props.onChange` direto, que o HistoryPage aplica de imediato (lib/timeRange.ts's
// matchesTimeRange trata cada lado ausente como um filtro aberto — só "De" já filtra a
// partir daquele horário, só "Até" já filtra até aquele horário).
//
// Dois estados coexistem de propósito: `draftFrom`/`draftTo` (espelha as props, mas
// atualiza a CADA passo do `TimePicker`, incluindo intermediários — só a hora escolhida,
// minuto ainda não) e `props.from`/`props.to` (só muda quando a seleção é aceita/válida).
// O `TimePicker` é montado com `value={clockTimeToDate(draftFrom)}` (não direto de
// `props.from`) porque o próprio MUI X precisa do valor do passo anterior pra compor o
// passo seguinte: ao escolher a hora, a lib faz `adapter.setHours(value ?? referenceDate,
// novaHora)` — se `value` não carregar a hora recém-escolhida na hora de montar o minuto
// (ou seja, se só atualizássemos via `onAccept`, no fim da seleção), o minuto é calculado
// em cima de um `referenceDate` do zero (meia-noite) em vez do valor parcial — bug real
// visto testando a build (a hora sempre virava "00" depois de escolher o minuto). A
// validação em si roda só em `onAccept` (dispara quando a seleção termina — minuto
// escolhido, picker fecha — não a cada passo intermediário): validar a cada `onChange`
// comparava um valor incompleto contra o outro lado e podia abrir o modal de conflito à
// toa antes do usuário terminar de escolher o minuto (outro bug real: querer "02:00–02:30",
// mesma hora nos dois, o modal abria só de bater a hora). Precisa de `closeOnSelect`
// explícito: o default do MUI X só fecha (e só marca a seleção como "finish"/`accept`)
// sozinho quando há UMA view só — com duas (hours+minutes, nosso caso) o default vira
// `false`, e sem fechar o dial nunca chega no passo "accept" — `onAccept` nunca dispara
// (outro bug real: clicar no relógio não definia valor nenhum no campo). "Até" nunca pode
// ficar menor que "De" (nem "De" maior que "Até"): applyTimeRangeChange (lib/timeRange.ts)
// decide se a edição é `ok` (propaga direto) ou `conflict` — nesse caso abre um
// `ConfirmDialog` perguntando se zera o lado oposto em vez de aplicar a mudança; cancelar
// não altera nada (`draftFrom`/`draftTo` voltam a espelhar as props no próximo render —
// "ajuste durante o render", não `useEffect`, mesmo padrão já usado em `CameraViewTabs.tsx`
// — já que uma seleção cancelada não deve deixar o campo mostrando o valor rejeitado).
export default function TimeRangeFilterPanel({ from, to, onChange }: TimeRangeFilterPanelProps) {
  const [pendingConflict, setPendingConflict] = useState<{
    field: 'from' | 'to'
    value: ClockTime
    resetSide: 'from' | 'to'
  } | null>(null)

  const [prevFrom, setPrevFrom] = useState(from)
  const [prevTo, setPrevTo] = useState(to)
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)
  if (from !== prevFrom) {
    setPrevFrom(from)
    setDraftFrom(from)
  }
  if (to !== prevTo) {
    setPrevTo(to)
    setDraftTo(to)
  }

  function handleFieldChange(field: 'from' | 'to', value: ClockTime | null) {
    const result = applyTimeRangeChange({ from, to }, field, value)
    if (result.kind === 'ok') {
      onChange(result.from, result.to)
      return
    }
    // value só é null quando o campo está sendo limpo — applyTimeRangeChange nunca devolve
    // `conflict` nesse caso (ver lib/timeRange.ts), então `value` aqui é sempre um ClockTime.
    setPendingConflict({ field, value: value as ClockTime, resetSide: result.resetSide })
  }

  function confirmResetConflict() {
    if (!pendingConflict) return
    onChange(
      pendingConflict.field === 'from' ? pendingConflict.value : null,
      pendingConflict.field === 'to' ? pendingConflict.value : null,
    )
    setPendingConflict(null)
  }

  const conflictFieldLabel = pendingConflict?.field === 'from' ? 'De' : 'Até'
  const resetSideLabel = pendingConflict?.resetSide === 'from' ? 'De' : 'Até'

  return (
    <MuiThemeProvider>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <div id="history-time-range-filter" className="flex w-full items-center gap-1">
          <TimePicker
            value={clockTimeToDate(draftFrom)}
            onChange={(d) => setDraftFrom(dateToClockTime(d))}
            onAccept={(d) => handleFieldChange('from', dateToClockTime(d))}
            viewRenderers={{ hours: renderTimeViewClock, minutes: renderTimeViewClock }}
            closeOnSelect
            ampm={false}
            slotProps={{
              textField: { id: 'history-time-range-from', size: 'small', 'aria-label': 'De' },
            }}
            sx={PICKER_SX}
          />
          <TimePicker
            value={clockTimeToDate(draftTo)}
            onChange={(d) => setDraftTo(dateToClockTime(d))}
            onAccept={(d) => handleFieldChange('to', dateToClockTime(d))}
            viewRenderers={{ hours: renderTimeViewClock, minutes: renderTimeViewClock }}
            closeOnSelect
            ampm={false}
            slotProps={{
              textField: { id: 'history-time-range-to', size: 'small', 'aria-label': 'Até' },
            }}
            sx={PICKER_SX}
          />
        </div>
      </LocalizationProvider>
      <ConfirmDialog
        open={pendingConflict != null}
        title="Horário inválido"
        message={`"${conflictFieldLabel}" não pode ficar nessa posição em relação a "${resetSideLabel}". Zerar "${resetSideLabel}" pra aplicar o novo horário?`}
        confirmLabel={`Zerar "${resetSideLabel}"`}
        onConfirm={confirmResetConflict}
        onCancel={() => setPendingConflict(null)}
      />
    </MuiThemeProvider>
  )
}
