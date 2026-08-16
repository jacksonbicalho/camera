import * as React from 'react'

import { cn } from '@/lib/utils'

// Switch — widget trilho+bolinha compartilhado (história
// refactor/switch-apply-button-compartilhados, T1), extraído do JSX
// hand-rolled que existia duplicado em ExtensionActiveToggle.tsx e em
// HistoryPage.tsx (#history-continuous-toggle). O <button role="switch">
// continua carregando o rótulo/legenda via `children` (em vez de um Switch
// separado dentro de outro botão, que seria HTML inválido) — mesma
// composição "botão único" que os dois usos originais já faziam.
export interface SwitchProps {
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  icon?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

export function Switch({
  id,
  checked,
  onChange,
  disabled,
  icon,
  className,
  children,
}: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('flex items-center gap-1.5 disabled:opacity-40', className)}
    >
      <span
        className={cn(
          'inline-flex h-5 w-14 shrink-0 items-center rounded-full border-2 transition-colors',
          checked ? 'justify-end border-primary' : 'justify-start border-faint',
        )}
      >
        <span
          className={cn(
            '-my-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-background transition-colors',
            checked ? 'border-primary text-primary' : 'border-faint text-faint',
          )}
        >
          {icon}
        </span>
      </span>
      {children}
    </button>
  )
}
