// Seções de configuração — usado pelos dois flyouts de Configurações do Sidebar
// (rail enxuto) e por SettingsLayout (coluna persistente nas páginas top-level
// de /settings/*). Agrupado em duas seções (pedido do navigator): "Configurações"
// (domínio Câmeras — a própria lista, detecção de movimento/zonas/análise/estados
// continuam só como abas do CameraSettingsTabs depois de escolher uma câmera, não
// viram link solto aqui) e "Configurações do Sistema" (Servidor — vira uma página
// com abas: Armazenamento/Sistema/Estatísticas/Relatórios/Sobre — Análise de
// vídeo, Usuários, Aparência). "Estatísticas" não é mais uma entrada solta nem uma
// aba de "Sistema": é uma aba de "Servidor" (ver ServerSettingsTabs) — por isso o
// link "Servidor" do admin aponta pra /settings/storage (1ª aba) e o do viewer
// (que não vê Armazenamento/Sistema, admin-only) aponta direto pra /settings/stats.
// "Histórico" é um item do tipo "picker": não é um link direto (a página é por
// câmera, /history/:id) — abre o mesmo seletor de câmera que "Relatórios" usava
// no rail (CameraPickerFlyout, ver componente).
import type { CameraPickerFlyoutProps } from './CameraPickerFlyout'

export interface SettingsNavLinkItem {
  kind?: 'link'
  id?: string
  to: string
  label: string
  /**
   * Rotas extras que também acendem esse item como ativo, além de `to`.
   * "Servidor" precisa disso: o link aponta pra 1ª aba (`/settings/storage`
   * pro admin, `/settings/stats` pro viewer), mas as outras abas de
   * `ServerSettingsTabs` vivem em rotas próprias (`/settings/system`,
   * `/settings/reports`, `/settings/about`...).
   */
  activePrefixes?: string[]
}

export interface SettingsNavPickerItem extends Pick<
  CameraPickerFlyoutProps,
  'id' | 'label' | 'activePrefix' | 'buildTarget'
> {
  kind: 'picker'
}

export type SettingsNavItem = SettingsNavLinkItem | SettingsNavPickerItem

export interface SettingsNavGroup {
  header: string
  items: SettingsNavItem[]
}

// isNavItemActive — regra única de "ativo" (rota própria + activePrefixes
// pro link, activePrefix pro picker), compartilhada entre SettingsNavGroups
// (por item, decide a classe visual) e ConfigGroupFlyout no Sidebar.tsx
// (agregado por grupo, decide se o botão do flyout acende) — antes duplicada
// nos dois lugares, com risco de divergir.
export function isNavItemActive(item: SettingsNavItem, pathname: string): boolean {
  if (item.kind === 'picker') return pathname.startsWith(item.activePrefix)
  return (
    pathname.startsWith(item.to) ||
    (item.activePrefixes?.some((p) => pathname.startsWith(p)) ?? false)
  )
}

const HISTORY_PICKER: SettingsNavPickerItem = {
  kind: 'picker',
  id: 'settings-nav-history',
  label: 'Histórico',
  activePrefix: '/history',
  buildTarget: (cameraId: string) => `/history/${cameraId}`,
}

export const ADMIN_SETTINGS_GROUPS: SettingsNavGroup[] = [
  {
    header: 'Configurações',
    items: [
      { to: '/settings/cameras', label: 'Câmeras' },
      { to: '/settings/discover', label: 'Rastrear câmeras' },
      { to: '/recordings', label: 'Gravações' },
      { to: '/motions', label: 'Momentos' },
      HISTORY_PICKER,
    ],
  },
  {
    header: 'Configurações do Sistema',
    items: [
      {
        to: '/settings/storage',
        label: 'Servidor',
        activePrefixes: [
          '/settings/system',
          '/settings/stats',
          '/settings/reports',
          '/settings/about',
        ],
      },
      { to: '/settings/analysis', label: 'Análise de vídeo' },
      { to: '/settings/users', label: 'Usuários' },
      { to: '/settings/appearance', label: 'Aparência' },
    ],
  },
]

export const VIEWER_SETTINGS_GROUPS: SettingsNavGroup[] = [
  {
    header: 'Configurações',
    items: [
      { to: '/settings/cameras', label: 'Câmeras' },
      { to: '/recordings', label: 'Gravações' },
      { to: '/motions', label: 'Momentos' },
      HISTORY_PICKER,
    ],
  },
  {
    header: 'Configurações do Sistema',
    items: [
      {
        to: '/settings/stats',
        label: 'Servidor',
        activePrefixes: ['/settings/reports', '/settings/about'],
      },
      { to: '/settings/appearance', label: 'Aparência' },
    ],
  },
]
