import { Badge } from '@/components/ui/badge'

interface ExtensionActiveToggleProps {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  savedActive: boolean
  description: string
  label?: string
}

// ExtensionActiveToggle — controle "Ativado" compartilhado por todo card de
// extensão (história fix/extension-card-compartilhado-e-s3-redesign, T1).
// Substitui o checkbox customizado de TelegramExtensionCard.tsx (história
// fix/ajustes-icone-telegram-e-momentos, T5) por um toggle switch — mesmo
// padrão já usado em HistoryPage.tsx (#history-continuous-toggle: button
// role="switch" com trilho+bolinha via border-primary/border-faint), sem
// inventar um novo. `checked` é o valor STAGED (controlado pelo chamador,
// só persiste quando o chamador aplica); `savedActive` é o último valor
// CONFIRMADO no servidor — alimenta só o selo à direita, somente-leitura,
// não afeta o próprio toggle nem a habilitação de nenhum botão (isso é
// decisão de cada card consumidor).
export default function ExtensionActiveToggle({
  id,
  checked,
  onChange,
  savedActive,
  description,
  label = 'Ativado',
}: ExtensionActiveToggleProps) {
  return (
    <div className="flex items-center justify-between gap-3 mb-6">
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="flex items-center gap-3 text-left"
      >
        <span
          className={`inline-flex h-5 w-14 shrink-0 items-center rounded-full border-2 transition-colors ${
            checked ? 'justify-end border-primary' : 'justify-start border-faint'
          }`}
        >
          <span
            className={`-my-0.5 h-6 w-6 rounded-full border-2 bg-background transition-colors ${
              checked ? 'border-primary' : 'border-faint'
            }`}
          />
        </span>
        <span>
          <span className="block text-base font-medium text-foreground">{label}</span>
          <span className="block text-sm text-muted-foreground">{description}</span>
        </span>
      </button>
      <Badge
        variant={savedActive ? 'success' : 'neutral'}
        className="gap-1.5 shrink-0"
        data-testid={`${id}-saved-badge`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {savedActive ? 'Ativado' : 'Desativado'}
      </Badge>
    </div>
  )
}
