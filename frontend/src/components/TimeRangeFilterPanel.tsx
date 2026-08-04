import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import ConfirmDialog from './ConfirmDialog'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { applyTimeRangeChange, type ClockTime } from '../lib/timeRange'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)
const POPOVER_MARGIN = 8

// clampCoord — mantém [start, start+size] inteiramente dentro de [0, viewportSize] (com uma
// margem mínima até a borda). Causa raiz dos 2 bugs de popover vazando a viewport já vistos
// nesta mesma sessão (calendário do DatePicker, cabeçalho do RecordingsPage): posicionar só
// a PARTIR do gatilho, sem checar se o painel CABE dali até a borda oposta. Aqui as duas
// bordas são checadas desde o início — `useFlyout` (sidebarFlyout.ts) tem essa mesma lacuna
// hoje, mas corrigi-lo é fora do escopo desta história (só este componente novo).
function clampCoord(start: number, size: number, viewportSize: number): number {
  const max = Math.max(POPOVER_MARGIN, viewportSize - size - POPOVER_MARGIN)
  return Math.min(Math.max(POPOVER_MARGIN, start), max)
}

interface ClockDropdownFieldProps {
  id: string
  ariaLabel: string
  values: readonly number[]
  value: number | null
  onSelect: (v: number | null) => void
}

// ClockDropdownField — um campo (hora OU minuto) do TimeRangeFilterPanel: botão-gatilho +
// painel de opções portalado (document.body, position: fixed). Nunca usa `<select>` nativo
// (pedido do navigator: "sem seta" — o `<select>` sempre desenha uma seta do jeito do
// browser, sem controle visual). Posição do painel calculada a partir do
// `getBoundingClientRect()` do gatilho E do tamanho REAL do painel (medido via ref, só
// depois de montado — `useLayoutEffect`, antes do navegador pintar), clampada em
// `[margem, viewport-tamanho-margem]` nos dois eixos via `clampCoord`.
function ClockDropdownField({ id, ariaLabel, values, value, onSelect }: ClockDropdownFieldProps) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const btn = triggerRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const panelWidth = panelRef.current?.offsetWidth ?? rect.width
    const panelHeight = panelRef.current?.offsetHeight ?? 0
    setStyle({
      position: 'fixed',
      zIndex: 9999,
      top: clampCoord(rect.bottom + 4, panelHeight, window.innerHeight),
      left: clampCoord(rect.left, panelWidth, window.innerWidth),
    })
    // Traz a opção selecionada pra dentro da área visível assim que a lista abre — sem isso,
    // escolher minuto=45 sempre abriria a lista rolada do topo (00), exigindo rolar bastante
    // numa lista de 60 itens.
    panelRef.current
      ?.querySelector<HTMLElement>('[aria-current="true"]')
      ?.scrollIntoView({ block: 'center' })

    function onDown(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEscapeKey(() => setOpen(false), open)

  return (
    <>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className="h-8 w-9 rounded-md border border-border bg-surface-2 text-center text-caption text-foreground hover:border-primary/50 focus:outline-none focus:border-primary/50"
      >
        {value === null ? '--' : pad2(value)}
      </button>
      {open &&
        createPortal(
          <div
            id={`${id}-list`}
            ref={panelRef}
            style={style}
            className="max-h-48 w-14 overflow-y-auto rounded-md border border-border bg-surface shadow-xl"
          >
            <button
              type="button"
              data-value="clear"
              onClick={() => {
                onSelect(null)
                setOpen(false)
              }}
              className="block w-full px-2 py-1 text-center text-caption text-muted-foreground hover:bg-surface-2"
            >
              --
            </button>
            {values.map((v) => (
              <button
                key={v}
                type="button"
                data-value={v}
                aria-current={v === value ? 'true' : undefined}
                onClick={() => {
                  onSelect(v)
                  setOpen(false)
                }}
                className={`block w-full px-2 py-1 text-center text-caption hover:bg-surface-2 ${
                  v === value ? 'bg-primary/10 font-medium text-primary' : 'text-foreground'
                }`}
              >
                {pad2(v)}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
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

// ClockSideField — os 2 campos (hora/minuto) de um lado (De ou Até) do filtro. Estado local
// (rascunho) espelha a prop `value` via "ajuste durante o render" (mesmo padrão já usado em
// CameraViewTabs.tsx) — reseta quando `value` muda de referência (ex.: o filtro foi limpo em
// outro lugar). Confirma (`onCommit`) quando os dois lados ficam definidos (`number`) ou os
// dois ficam `null` (lado aberto) — só um definido é um estado intermediário, não confirma
// ainda (mesmo espírito do antigo `onAccept`/`onBlur`, evita abrir o modal de conflito com um
// valor pela metade).
function ClockSideField({ idPrefix, ariaLabel, value, onCommit }: ClockSideFieldProps) {
  const [prevValue, setPrevValue] = useState(value)
  const [hour, setHour] = useState<number | null>(value?.hour ?? null)
  const [minute, setMinute] = useState<number | null>(value?.minute ?? null)
  if (value !== prevValue) {
    setPrevValue(value)
    setHour(value?.hour ?? null)
    setMinute(value?.minute ?? null)
  }

  function commitIfComplete(nextHour: number | null, nextMinute: number | null) {
    if (nextHour === null && nextMinute === null) {
      if (value !== null) onCommit(null)
      return
    }
    if (nextHour === null || nextMinute === null) return
    if (value && value.hour === nextHour && value.minute === nextMinute) return
    onCommit({ hour: nextHour, minute: nextMinute })
  }

  return (
    <div id={idPrefix} className="flex items-center gap-1">
      <ClockDropdownField
        id={`${idPrefix}-hour`}
        ariaLabel={`${ariaLabel} — hora`}
        values={HOURS}
        value={hour}
        onSelect={(v) => {
          setHour(v)
          commitIfComplete(v, minute)
        }}
      />
      <span aria-hidden="true" className="text-muted-foreground text-caption">
        :
      </span>
      <ClockDropdownField
        id={`${idPrefix}-minute`}
        ariaLabel={`${ariaLabel} — minuto`}
        values={MINUTES}
        value={minute}
        onSelect={(v) => {
          setMinute(v)
          commitIfComplete(hour, v)
        }}
      />
    </div>
  )
}

// TimeRangeFilterPanel — painel de filtro de horário do Histórico (linha própria, cheia, na
// coluna lateral — ver HistoryPage.tsx): dois `ClockSideField` (De/Até), cada um com 2
// dropdowns (hora/minuto) — substitui o antigo par de `TimePicker` do MUI X (história
// refactor/remover-mui-time-range-filter, motivada pelo navigator: reduzir a exceção MUI e
// simplificar a UI; os dropdowns em si vieram de um pedido seguinte, trocando a digitação
// livre por seleção de uma lista fechada de valores válidos). Filtra AO VIVO: sem botão
// "Aplicar" — cada lado completo já chama `onChange` direto, que o HistoryPage aplica de
// imediato (lib/timeRange.ts's matchesTimeRange trata cada lado ausente como um filtro
// aberto).
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
