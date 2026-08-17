import type { ReactNode } from 'react'

interface ExtensionCardProps {
  id: string
  icon: ReactNode
  name: string
  description: string
  available: boolean
  children: ReactNode
}

// ExtensionCard — chrome visual compartilhado por todo card de extensão em
// PreferencesExtensionsPage (história fix/extension-card-compartilhado-e-s3-redesign,
// T1 — extraído de TelegramExtensionCard.tsx, história fix/ajustes-icone-telegram-e-momentos
// T5). Cobre só o que é idêntico entre extensões (ícone com halo, nome,
// descrição, divisor, gate de `available`) — o conteúdo específico de cada
// extensão (toggle, formulário, botões) entra via `children`, nunca aqui.
export default function ExtensionCard({
  id,
  icon,
  name,
  description,
  available,
  children,
}: ExtensionCardProps) {
  return (
    <div id={id} className="bg-surface border border-border rounded-xl p-6 max-w-md">
      <div className="flex items-center gap-4 mb-4">
        <div className="relative shrink-0">
          <div className="absolute inset-0 -m-2 rounded-full bg-primary/20 blur-lg" />
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{name}</p>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
      {available ? (
        <>
          <div className="border-t border-border my-4" />
          {children}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Extensão não permitida nesta instância.</p>
      )}
    </div>
  )
}
