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
//
// `available=false` (história feat/extensao-face-detector, revisão pós-G2:
// navigator pediu campos travados em vez de escondidos): `children` continua
// renderizando sempre — só entra num `<fieldset disabled>` (desabilita
// nativamente todo `<button>`/`<input>` descendente, sem precisar propagar
// `disabled` manualmente por cada componente filho) com opacidade reduzida.
// Efeito colateral desejado: todo card ocupa a mesma altura seja lá qual for
// o estado de `available` — sem herança de tamanho entre cards vizinhos via
// flex/grid stretch, o conteúdo em si já é o mesmo.
export default function ExtensionCard({
  id,
  icon,
  name,
  description,
  available,
  children,
}: ExtensionCardProps) {
  return (
    <div id={id} className="bg-surface border border-border rounded-xl p-6 max-w-md flex flex-col">
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
      <div className="border-t border-border my-4" />
      {!available && (
        <p className="text-xs text-muted-foreground mb-4">
          Extensão não permitida nesta instância.
        </p>
      )}
      <fieldset disabled={!available} className="border-0 p-0 m-0 min-w-0 disabled:opacity-50">
        {children}
      </fieldset>
    </div>
  )
}
