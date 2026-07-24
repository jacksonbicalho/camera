import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { isNavItemActive, type SettingsNavGroup } from './settingsNavLinks'
import CameraPickerFlyout from './CameraPickerFlyout'

interface SettingsNavGroupsProps {
  groups: SettingsNavGroup[]
  ariaLabel: string
  /** Chamado ao navegar por um item (link ou picker) — usado por quem embrulha
   * isto num flyout (Sidebar), pra fechar o flyout ao selecionar. */
  onSelect?: () => void
}

// Estilo de item calcado no GitHub Settings (cabeçalho de grupo em caixa
// normal, cinza médio, seguido de itens soltos — barra de destaque à
// esquerda no item ativo, não um fundo genérico) — referência visual dada
// pelo navigator.
const itemClass = (active: boolean) =>
  cn(
    'flex items-center rounded-md border-l-2 py-1.5 pr-3 pl-[10px] text-sm transition-colors',
    active
      ? 'border-primary bg-surface-2 font-medium text-foreground'
      : 'border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground',
  )

// SettingsNavGroups — lista vertical de navegação com cabeçalho de grupo
// (padrão GitHub Settings), compartilhada entre a coluna persistente
// (SettingsLayout, os 2 grupos juntos) e os dois flyouts de Configurações do
// Sidebar (cada um só com o seu grupo). Cada grupo (settingsNavLinks.ts) tem
// itens do tipo "link" (Link) ou "picker" (CameraPickerFlyout
// variant="list" — abre um seletor de câmera em vez de navegar direto, ex.:
// "Histórico", que é por câmera). Ativo calculado via isNavItemActive porque
// "Servidor" acende em várias rotas (`activePrefixes`), não só na sua
// própria `to` — por isso é `Link`, não `NavLink`: o `isActive` interno do
// NavLink (baseado só em `to`) ignoraria activePrefixes e faria o React
// Router sobrescrever o `aria-current` explícito de volta pra `undefined`
// nas rotas que só activePrefixes cobre (confirmado: passar aria-current a
// um NavLink não tem efeito quando o isActive nativo dele é false).
export default function SettingsNavGroups({ groups, ariaLabel, onSelect }: SettingsNavGroupsProps) {
  const { pathname } = useLocation()

  return (
    <nav className="w-full" aria-label={ariaLabel}>
      {groups.map((group) => (
        <div key={group.header} className="mb-6 last:mb-0">
          <p className="mb-2 px-3 text-sm font-semibold text-muted-foreground">{group.header}</p>
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => (
              <li key={item.kind === 'picker' ? item.id : item.to}>
                {item.kind === 'picker' ? (
                  <CameraPickerFlyout
                    id={item.id}
                    label={item.label}
                    showLabel
                    activePrefix={item.activePrefix}
                    buildTarget={item.buildTarget}
                    variant="list"
                    onNavigate={onSelect}
                  />
                ) : (
                  <Link
                    id={item.id}
                    to={item.to}
                    onClick={onSelect}
                    aria-current={isNavItemActive(item, pathname) ? 'page' : undefined}
                    className={itemClass(isNavItemActive(item, pathname))}
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
