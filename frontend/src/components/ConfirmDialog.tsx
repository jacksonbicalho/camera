import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { Button } from '@/components/ui/button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  children?: ReactNode
  onConfirm: () => void
  onCancel: () => void
}

// Portalado direto pra document.body: ConfirmDialog é modal — precisa desenhar
// acima de QUALQUER outra UI, independente de onde o caller vive na árvore. Sem
// o portal, um caller aninhado dentro de um ancestral que cria seu próprio
// stacking context (ex.: o wrapper `sticky z-10` da Sidebar em Layout.tsx)
// prende o z-index do diálogo DENTRO daquele contexto — ele nunca vence, por
// maior que seja o valor, elementos fora dele (ex.: os flyouts da Sidebar, que
// já são portais pra body com zIndex 9999). z-10000 > 9999 garante a ordem
// certa entre os dois quando ambos são portais-irmãos de body.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEscapeKey(onCancel, open)

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-10000 flex items-center justify-center bg-black/60">
      <div className="bg-surface-2 border border-border rounded-lg shadow-xl p-6 w-80 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{message}</p>
        {children}
        <div className="flex justify-end gap-3">
          <Button id="confirm-dialog-cancel" size="sm" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            id="confirm-dialog-confirm"
            size="sm"
            variant={danger ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
