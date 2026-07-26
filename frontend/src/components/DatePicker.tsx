import { useState, useRef, useEffect, useLayoutEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Matcher } from 'react-day-picker'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Calendar from './Calendar'
import { Button } from './ui/button'
import { CalendarDays } from './Icons'
import { calendarContent, dateKey, parseDayKey } from '@/lib/calendar'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value: Date
  onChange: (d: Date) => void
  /** Desabilita datas futuras. */
  disableFuture?: boolean
  /**
   * Datas (yyyy-MM-dd) com conteúdo. Quando fornecido e não-vazio, desabilita
   * os dias fora do conjunto e limita a navegação ao intervalo com conteúdo.
   */
  availableDays?: string[]
  /** Abre o popover para cima (quando o gatilho está perto do rodapé). */
  openUp?: boolean
  /** Alinhamento horizontal do popover. */
  align?: 'left' | 'right'
  /** Botão-gatilho estica pra ocupar a largura toda do container (default: compacto,
   * tamanho do conteúdo — uso do HistoryPage, linha própria na coluna lateral). */
  fullWidth?: boolean
  id?: string
}

// DatePicker — botão com a data + popover com o Calendar unificado (redesign do
// Escopo B). Substitui os popovers de data ad-hoc da timeline e dos Estados.
//
// O popover renderiza via portal (document.body), com posição calculada a partir do
// getBoundingClientRect() do próprio botão — não `position: absolute` relativo a um
// ancestral qualquer. Sem isso, um ancestral com `overflow-hidden` no caminho (ex.: o
// sidebar de gravações do Histórico, cujo overflow-hidden é proposital — mecanismo de
// altura do sidebar, ver HistoryPage.tsx) recorta o popover em vez de deixá-lo flutuar
// livremente sobre a página ("abrindo dentro da lista", bug relatado). `position: fixed`
// evita ter que somar scroll manualmente: os valores de getBoundingClientRect() já são
// relativos à viewport, exatamente o que `fixed` espera.
export default function DatePicker({
  value,
  onChange,
  disableFuture,
  availableDays,
  openUp,
  align = 'left',
  fullWidth,
  id,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const cal = calendarContent(availableDays ?? [], new Date())
  const disabled: Matcher[] = []
  if (disableFuture) disabled.push({ after: new Date() })
  if (cal.daySet.size > 0) disabled.push((d: Date) => !cal.daySet.has(dateKey(d)))

  // Fecha ao clicar fora do botão OU do popover (os dois agora vivem em subárvores DOM
  // diferentes por causa do portal — checar só um dos dois trataria clique dentro do
  // outro como "fora").
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Recalcula a posição toda vez que abre (o botão pode ter se movido desde a última
  // vez). Fecha ao rolar a página em vez de reposicionar continuamente — mais simples e
  // aceitável pra um popover de escolha de data (mesmo espírito do "fecha ao clicar
  // fora" já existente); nenhum listener de mousemove/mouseup, sem estado de "arraste".
  useLayoutEffect(() => {
    if (!open) return
    const btn = triggerRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setStyle({
      position: 'fixed',
      // Mesmo z-index dos outros portais pra body do repo (Sidebar/MotionNotificationsBell)
      // — z-30 (Tailwind) competia só num stacking context local; um flyout/menu aberto ao
      // mesmo tempo ficaria por cima do popover sem isso.
      zIndex: 9999,
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      ...(align === 'right' ? { right: window.innerWidth - rect.right } : { left: rect.left }),
      // `fullWidth`: o popover usa a MESMA largura do gatilho (a coluna inteira) em vez da
      // largura natural do Calendar — sem isso, num gatilho esticado (coluna estreita do
      // Histórico) o popover ficava mais largo que a coluna e vazava por cima do player
      // (bug relatado pelo navigator, screenshot real).
      ...(fullWidth ? { width: rect.width } : {}),
    })
    const onScroll = () => setOpen(false)
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => window.removeEventListener('scroll', onScroll, { capture: true })
  }, [open, openUp, align, fullWidth])

  return (
    <div className={cn('relative', fullWidth && 'w-full')}>
      <Button
        id={id}
        ref={triggerRef}
        variant="outline"
        size="sm"
        className={cn('tabular-nums gap-1.5', fullWidth && 'w-full justify-center')}
        onClick={() => setOpen((o) => !o)}
      >
        <CalendarDays className="w-3.5 h-3.5" />
        {format(value, 'dd/MM/yyyy', { locale: ptBR })}
      </Button>
      {open &&
        createPortal(
          <div
            id={id ? `${id}-popover` : undefined}
            ref={popoverRef}
            style={style}
            className={cn('bg-surface border border-border rounded-lg p-2 shadow-xl')}
          >
            <Calendar
              mode="single"
              selected={value}
              defaultMonth={value}
              startMonth={cal.startMonth}
              endMonth={cal.endMonth}
              disabled={disabled.length > 0 ? disabled : undefined}
              modifiers={
                cal.daySet.size > 0
                  ? { hasContent: (availableDays ?? []).map(parseDayKey) }
                  : undefined
              }
              modifiersClassNames={{ hasContent: 'font-semibold text-primary' }}
              onSelect={(d) => {
                if (d) {
                  onChange(d)
                  setOpen(false)
                }
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  )
}
