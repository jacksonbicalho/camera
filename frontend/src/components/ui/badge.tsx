import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// Badge — mesmo padrão "soft" (fundo translúcido + texto vívido + borda) já
// usado nos badges manuais do app (RoleBadge, StatusBadges de
// CamerasSettingsPage, badges de método do DiscoverPage) antes desta
// migração, agora centralizado num único componente via cva (mesmo padrão de
// button.tsx). Não usa os tokens sólidos bg-success/bg-danger — peso visual
// forte demais pra um badge inline, pensados pra botões/alertas.
const badgeVariants = cva('inline-flex items-center rounded border px-1.5 py-0.5 text-xs', {
  variants: {
    variant: {
      neutral: 'bg-surface-2 text-muted-foreground border-border',
      success: 'bg-green-900/40 text-green-400 border-green-800/50',
      info: 'bg-blue-900/40 text-blue-400 border-blue-800/50',
    },
  },
  defaultVariants: {
    variant: 'neutral',
  },
})

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />
}

// badgeVariants é exportado pra eventual reuso por outros componentes shadcn
// (mesmo precedente de buttonVariants em button.tsx).
// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants }
