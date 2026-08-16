import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'

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
// fix/ajustes-icone-telegram-e-momentos, T5) por um toggle switch — monta o
// primitivo compartilhado Switch (components/ui/switch.tsx, história
// refactor/switch-apply-button-compartilhados, T1), que substituiu o JSX
// hand-rolled também duplicado em HistoryPage.tsx (#history-continuous-toggle).
// `checked` é o valor STAGED (controlado pelo chamador, só persiste quando o
// chamador aplica); `savedActive` é o último valor CONFIRMADO no servidor —
// alimenta só o selo à direita, somente-leitura, não afeta o próprio toggle
// nem a habilitação de nenhum botão (isso é decisão de cada card consumidor).
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
      <Switch
        id={id}
        checked={checked}
        onChange={onChange}
        className="items-center gap-3 text-left"
      >
        <span>
          <span className="block text-base font-medium text-foreground">{label}</span>
          <span className="block text-sm text-muted-foreground">{description}</span>
        </span>
      </Switch>
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
