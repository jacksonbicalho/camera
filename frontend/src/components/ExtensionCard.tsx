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
// `available=false` (história fix/altura-consistente-extension-card): o card
// inteiro fica opaco (`opacity-40`) em vez de trocar o conteúdo por um aviso
// de texto — sinaliza "desabilitada" sem tirar espaço nem altura do card, e
// ganha um `title` nativo (tooltip do próprio browser ao passar o mouse,
// mesmo padrão de `ThemeModeNav`/`UserMenu` neste projeto — sem componente
// de tooltip dedicado) explicando o motivo. `children` continua renderizando
// sempre, travado num `<fieldset disabled>` (desabilita nativamente todo
// `<button>`/`<input>` descendente, sem precisar propagar `disabled`
// manualmente por cada card filho) — garante que nenhum campo fique
// clicável, além de manter a mesma altura do card em qualquer estado de
// `available`.
export default function ExtensionCard({
  id,
  icon,
  name,
  description,
  available,
  children,
}: ExtensionCardProps) {
  return (
    <div
      id={id}
      title={available ? undefined : 'Esta extensão não está habilitada nesta instância.'}
      className={`bg-surface border border-border rounded-xl p-6 max-w-md${
        available ? '' : ' opacity-40'
      }`}
    >
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
      <fieldset disabled={!available} className="border-0 p-0 m-0 min-w-0">
        {children}
      </fieldset>
    </div>
  )
}
