import { useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { applyTimeRangeChange, type ClockTime } from '../lib/timeRange'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function clampInt(raw: string, max: number): number {
  return Math.min(max, Math.max(0, Number(raw)))
}

export interface TimeRangeFilterPanelProps {
  from: ClockTime | null
  to: ClockTime | null
  onChange: (from: ClockTime | null, to: ClockTime | null) => void
}

interface ClockSideFieldProps {
  idPrefix: string
  ariaLabel: string
  value: ClockTime | null
  onCommit: (v: ClockTime | null) => void
}

// ClockSideField — os 2 campos (hora/minuto) de um lado (De ou Até) do filtro.
// `inputMode="numeric"` (não `type="number"`) — evita dois efeitos colaterais do input
// numérico nativo que atrapalham um campo de 2 dígitos: remover o zero à esquerda enquanto
// digita ("05" vira "5") e as setas de incremento/decremento (ruído visual num campo tão
// estreito) — mesmo teclado numérico no celular, sem os dois problemas.
//
// Estado local (rascunho) espelha a prop `value` via "ajuste durante o render" (mesmo padrão
// já usado em CameraViewTabs.tsx) — reseta quando `value` muda de referência (ex.: o filtro
// foi limpo em outro lugar). Confirma (chama `onCommit`) no `onBlur` de qualquer um dos dois
// campos: os dois vazios → `null` (lado aberto); os dois preenchidos → `ClockTime`, com
// clamp (hora até 23, minuto até 59) e zero-padding; só um preenchido → não confirma ainda
// (estado intermediário — mesmo espírito do antigo `onAccept` do MUI, que só disparava no
// fim da seleção completa, evitando abrir o modal de conflito com um valor pela metade).
function ClockSideField({ idPrefix, ariaLabel, value, onCommit }: ClockSideFieldProps) {
  const [prevValue, setPrevValue] = useState(value)
  const [hourText, setHourText] = useState(value ? pad2(value.hour) : '')
  const [minuteText, setMinuteText] = useState(value ? pad2(value.minute) : '')
  if (value !== prevValue) {
    setPrevValue(value)
    setHourText(value ? pad2(value.hour) : '')
    setMinuteText(value ? pad2(value.minute) : '')
  }

  // commitIfComplete clampa os DOIS lados de novo (mesmo se quem chamou já tiver clampado
  // o campo que acabou de perder foco) porque o campo IRMÃO pode ainda não ter passado pelo
  // próprio onBlur (ex.: digitar "99" no minuto e sair direto pelo campo de hora, sem nunca
  // ter saído do minuto) — sem esse segundo clamp aqui, um valor fora do intervalo digitado
  // no campo que NÃO disparou o blur escaparia sem correção.
  function commitIfComplete(nextHour: string, nextMinute: string) {
    if (nextHour === '' && nextMinute === '') {
      if (value !== null) onCommit(null)
      return
    }
    if (nextHour === '' || nextMinute === '') return
    const hour = clampInt(nextHour, 23)
    const minute = clampInt(nextMinute, 59)
    // Evita disparar onChange (e um refiltro em HistoryPage) quando nada mudou de verdade —
    // ex. usuário só passou o Tab por cima do campo sem editar.
    if (value && value.hour === hour && value.minute === minute) return
    onCommit({ hour, minute })
  }

  function digitsOnly(raw: string): string {
    return raw.replace(/\D/g, '').slice(0, 2)
  }

  return (
    <div id={idPrefix} className="flex items-center gap-1">
      <input
        id={`${idPrefix}-hour`}
        aria-label={`${ariaLabel} — hora`}
        type="text"
        inputMode="numeric"
        placeholder="--"
        value={hourText}
        onChange={(e) => setHourText(digitsOnly(e.target.value))}
        onBlur={(e) => {
          const next = e.target.value === '' ? '' : pad2(clampInt(e.target.value, 23))
          setHourText(next)
          commitIfComplete(next, minuteText)
        }}
        className="h-8 w-9 rounded-md border border-border bg-surface-2 px-1 text-center text-caption text-foreground focus:outline-none focus:border-primary/50"
      />
      <span aria-hidden="true" className="text-muted-foreground text-caption">
        :
      </span>
      <input
        id={`${idPrefix}-minute`}
        aria-label={`${ariaLabel} — minuto`}
        type="text"
        inputMode="numeric"
        placeholder="--"
        value={minuteText}
        onChange={(e) => setMinuteText(digitsOnly(e.target.value))}
        onBlur={(e) => {
          const next = e.target.value === '' ? '' : pad2(clampInt(e.target.value, 59))
          setMinuteText(next)
          commitIfComplete(hourText, next)
        }}
        className="h-8 w-9 rounded-md border border-border bg-surface-2 px-1 text-center text-caption text-foreground focus:outline-none focus:border-primary/50"
      />
    </div>
  )
}

// TimeRangeFilterPanel — painel de filtro de horário do Histórico (linha própria, cheia, na
// coluna lateral — ver HistoryPage.tsx): dois `ClockSideField` (De/Até), substituindo o
// antigo par de `TimePicker` do MUI X (dial de relógio) — história
// refactor/remover-mui-time-range-filter, motivada pelo navigator: reduzir a exceção MUI (o
// resto do app é 100% Tailwind) e simplificar a UI. Filtra AO VIVO: sem botão "Aplicar" —
// cada lado completo já chama `onChange` direto, que o HistoryPage aplica de imediato
// (lib/timeRange.ts's matchesTimeRange trata cada lado ausente como um filtro aberto).
//
// "Até" nunca pode ficar menor que "De" (nem "De" maior que "Até"): applyTimeRangeChange
// (lib/timeRange.ts, inalterado por esta história) decide se a edição é `ok` (propaga
// direto) ou `conflict` — nesse caso abre um `ConfirmDialog` perguntando se zera o lado
// oposto. Cancelar não deve deixar o campo mostrando o valor rejeitado — como a prop `from`/
// `to` não muda nesse caso (só a mudança de REFERÊNCIA da prop reseta o rascunho do
// `ClockSideField`, ver comentário lá), `resetTick` força o remount dos dois campos via
// `key` a cada cancelamento, descartando o rascunho rejeitado.
export default function TimeRangeFilterPanel({ from, to, onChange }: TimeRangeFilterPanelProps) {
  const [pendingConflict, setPendingConflict] = useState<{
    field: 'from' | 'to'
    value: ClockTime
    resetSide: 'from' | 'to'
  } | null>(null)
  const [resetTick, setResetTick] = useState(0)

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

  function cancelConflict() {
    setPendingConflict(null)
    setResetTick((t) => t + 1)
  }

  const conflictFieldLabel = pendingConflict?.field === 'from' ? 'De' : 'Até'
  const resetSideLabel = pendingConflict?.resetSide === 'from' ? 'De' : 'Até'

  return (
    <div id="history-time-range-filter" className="flex w-full items-center gap-2">
      <ClockSideField
        key={`from-${resetTick}`}
        idPrefix="history-time-range-from"
        ariaLabel="De"
        value={from}
        onCommit={(v) => handleFieldChange('from', v)}
      />
      <span className="text-muted-foreground text-caption">–</span>
      <ClockSideField
        key={`to-${resetTick}`}
        idPrefix="history-time-range-to"
        ariaLabel="Até"
        value={to}
        onCommit={(v) => handleFieldChange('to', v)}
      />
      <ConfirmDialog
        open={pendingConflict != null}
        title="Horário inválido"
        message={`"${conflictFieldLabel}" não pode ficar nessa posição em relação a "${resetSideLabel}". Zerar "${resetSideLabel}" pra aplicar o novo horário?`}
        confirmLabel={`Zerar "${resetSideLabel}"`}
        onConfirm={confirmResetConflict}
        onCancel={cancelConflict}
      />
    </div>
  )
}
