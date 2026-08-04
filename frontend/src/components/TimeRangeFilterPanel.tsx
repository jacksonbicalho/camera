import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react'
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
// Janela de inatividade que reseta o buffer de type-ahead (mesmo espírito do <select>
// nativo: dígitos digitados em sequência rápida se combinam, uma pausa recomeça a busca).
const TYPEAHEAD_RESET_MS = 600

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
  containerRef: RefObject<HTMLDivElement | null>
}

// ClockDropdownField — um campo (hora OU minuto) do TimeRangeFilterPanel: botão-gatilho +
// painel de opções portalado (document.body, position: fixed). Nunca usa `<select>` nativo
// (pedido do navigator: "sem seta" — o `<select>` sempre desenha uma seta do jeito do
// browser, sem controle visual). Posição do painel calculada a partir do
// `getBoundingClientRect()` do gatilho E do tamanho REAL do painel (medido via ref, só
// depois de montado — `useLayoutEffect`, antes do navegador pintar), clampada em
// `[margem, viewport-tamanho-margem]` nos dois eixos via `clampCoord`.
function ClockDropdownField({
  id,
  ariaLabel,
  values,
  value,
  onSelect,
  containerRef,
}: ClockDropdownFieldProps) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Buffer de type-ahead (achado do navigator testando a página real: perdemos o "digitar
  // pra adiantar" do <select> nativo ao trocar por um painel próprio, T4) — ref, não state:
  // não precisa re-renderizar a cada tecla, só lido/escrito dentro do handler de teclado.
  const typeaheadRef = useRef<{ buffer: string; lastTime: number }>({ buffer: '', lastTime: 0 })

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

    function onDown(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    // Fecha ao rolar a PÁGINA em vez de reposicionar continuamente — mesmo padrão já usado
    // por DatePicker.tsx. Sem isso, rolar a página deixa o painel "solto" do campo (ele fica
    // parado na posição antiga, já que só recalcula quando `open` muda) — achado real do
    // navigator testando a página no celular. `scroll` não faz bubbling, mas ATRAVESSA a
    // fase de captura de qualquer ancestral (inclusive `window`) — sem o guard de
    // `contains`, rolar a LISTA em si (ela é `overflow-y-auto`, tem 60 itens no caso do
    // minuto) também dispararia isso e fecharia o painel no meio da rolagem/type-ahead
    // (achado do code review, confirmado rodando o componente de verdade).
    function onScroll(e: Event) {
      // `e.target` é `window` quando a página inteira rola (não um Node — `.contains()`
      // lançaria TypeError se chamado com ele direto) — só o guard de "dentro do painel"
      // precisa do caso Node de verdade (scroll de um elemento, ex. a própria lista).
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return
      setOpen(false)
    }
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [open])

  // Efeito SEPARADO do de posicionamento acima, de propósito — depende de `style` (não só
  // `open`), então só roda de verdade DEPOIS que a posição real (position:fixed + top/left
  // clampados) já foi commitada no DOM pelo efeito anterior. Bug real reportado pelo
  // navigator: no PRIMEIro clique em qualquer um dos 4 campos, a página inteira rolava pra
  // baixo — porque antes desta separação, `.focus()`/`scrollIntoView()` rodavam na MESMA
  // passada de efeito que `setStyle(...)`, e uma atualização de estado não reflete no DOM
  // sincronamente dentro do mesmo efeito — na 1ª abertura de cada campo (`style` ainda era o
  // valor inicial `{}`, sem `position:fixed`), o painel portalado ainda estava em fluxo
  // normal (provavelmente no fim do `<body>`), e focar um botão lá dentro fazia o browser
  // rolar a página inteira até ele.
  useLayoutEffect(() => {
    if (!open || style.position !== 'fixed') return
    // Move o foco pra DENTRO do painel (opção selecionada, ou a primeira opção numérica se
    // nada estiver selecionado) assim que a lista abre, e traz ela pra área visível. Achado
    // do code review: sem isso, o foco fica no botão-gatilho (comportamento padrão do
    // browser ao clicar num <button>) — e como o gatilho é IRMÃO do painel portalado (não
    // ancestral, nem na árvore DOM nem na React), uma tecla digitada nunca alcançaria o
    // onKeyDown do painel (o "digitar pra adiantar" simplesmente não disparava na interação
    // real, só nos testes que despacham o evento direto no painel). `preventScroll: true`
    // (defesa extra, além da ordem correta acima) — focar nunca deve, por si só, mover a
    // página; só o `scrollIntoView` explícito abaixo deve, e mesmo assim só dentro do
    // próprio painel `overflow-y-auto` (o painel inteiro já cabe na viewport por construção,
    // graças ao `clampCoord`).
    const focusTarget =
      panelRef.current?.querySelector<HTMLElement>('[aria-current="true"]') ??
      panelRef.current?.querySelector<HTMLElement>('button[data-value]:not([data-value="clear"])')
    focusTarget?.focus({ preventScroll: true })
    focusTarget?.scrollIntoView({ block: 'center' })
  }, [open, style])

  useEscapeKey(() => setOpen(false), open)

  // handleTypeahead — dígitos digitados enquanto a lista está aberta pulam direto pra opção
  // correspondente (foco + scrollIntoView; confirmar com Enter/Espaço já funciona nativo,
  // são <button> de verdade). Interpreta o buffer acumulado como NÚMERO (não prefixo de
  // texto): "1"→valor 1, "1"+"4" em seguida→valor 14. Se o buffer combinado não bate com
  // nenhuma opção (ex. "9"+"9"=99, hora só vai até 23), cai de volta pro último dígito
  // sozinho — equivalente a começar uma busca nova a partir dele.
  function handleTypeahead(e: { key: string }) {
    if (!/^[0-9]$/.test(e.key)) return
    const now = Date.now()
    const state = typeaheadRef.current
    if (now - state.lastTime > TYPEAHEAD_RESET_MS) state.buffer = ''
    state.buffer += e.key
    state.lastTime = now
    let match = values.find((v) => v === Number(state.buffer))
    if (match === undefined) {
      state.buffer = e.key
      match = values.find((v) => v === Number(state.buffer))
    }
    if (match !== undefined) {
      const btn = panelRef.current?.querySelector<HTMLElement>(`[data-value="${match}"]`)
      btn?.focus()
      btn?.scrollIntoView({ block: 'center' })
    }
  }

  // handleKeyDown — Tab/Shift+Tab com o painel aberto: como o painel é portalado (fim do
  // `<body>`, irmão do gatilho, não ancestral), o Tab nativo seguiria a ordem FÍSICA do DOM em
  // vez da ordem LÓGICA dos 4 campos (De-hora/De-minuto/Até-hora/Até-minuto) — pedido do
  // navigator pra corrigir. `containerRef` (o wrapper `#history-time-range-filter`) só contém
  // os 4 botões-gatilho com `id` (as opções da lista não têm `id`, e o painel em si está fora
  // dele, portalado), então `querySelectorAll('button[id]')` mais o índice do gatilho atual dá
  // o próximo/anterior direto. Nas bordas (Tab no último campo, Shift+Tab no primeiro) não há
  // vizinho — fecha o painel e deixa o Tab nativo seguir seu curso normal, sem
  // `preventDefault`.
  function handleKeyDown(e: ReactKeyboardEvent) {
    handleTypeahead(e)
    if (e.key !== 'Tab') return
    const triggers = containerRef.current
      ? Array.from(containerRef.current.querySelectorAll<HTMLButtonElement>('button[id]'))
      : []
    const idx = triggers.findIndex((btn) => btn.id === id)
    const nextIdx = idx + (e.shiftKey ? -1 : 1)
    const next = triggers[nextIdx]
    if (!next) {
      setOpen(false)
      return
    }
    e.preventDefault()
    setOpen(false)
    next.focus({ preventScroll: true })
  }

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
            onKeyDown={handleKeyDown}
            className="max-h-48 w-14 overflow-y-auto rounded-md border border-border bg-surface shadow-xl scrollbar-thin"
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
  containerRef: RefObject<HTMLDivElement | null>
}

// ClockSideField — os 2 campos (hora/minuto) de um lado (De ou Até) do filtro. Estado local
// (rascunho) espelha a prop `value` via "ajuste durante o render" (mesmo padrão já usado em
// CameraViewTabs.tsx) — reseta quando `value` muda de referência (ex.: o filtro foi limpo em
// outro lugar). Confirma (`onCommit`) quando os dois lados ficam definidos (`number`) ou os
// dois ficam `null` (lado aberto) — só um definido é um estado intermediário, não confirma
// ainda (mesmo espírito do antigo `onAccept`/`onBlur`, evita abrir o modal de conflito com um
// valor pela metade).
function ClockSideField({
  idPrefix,
  ariaLabel,
  value,
  onCommit,
  containerRef,
}: ClockSideFieldProps) {
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
        containerRef={containerRef}
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
        containerRef={containerRef}
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
  const containerRef = useRef<HTMLDivElement>(null)

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
    <div
      id="history-time-range-filter"
      ref={containerRef}
      className="flex w-full items-center gap-2"
    >
      <ClockSideField
        key={`from-${resetTick}`}
        idPrefix="history-time-range-from"
        ariaLabel="De"
        value={from}
        onCommit={(v) => handleFieldChange('from', v)}
        containerRef={containerRef}
      />
      <span className="text-muted-foreground text-caption">–</span>
      <ClockSideField
        key={`to-${resetTick}`}
        idPrefix="history-time-range-to"
        ariaLabel="Até"
        value={to}
        onCommit={(v) => handleFieldChange('to', v)}
        containerRef={containerRef}
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
