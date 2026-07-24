import type { ReactNode } from 'react'
import { getRole } from '../auth'
import Layout from './Layout'
import SettingsNavGroups from './SettingsNavGroups'
import { ADMIN_SETTINGS_GROUPS, VIEWER_SETTINGS_GROUPS } from './settingsNavLinks'

interface SettingsLayoutProps {
  id: string
  footerId?: string
  children: ReactNode
}

// SettingsLayout — coluna persistente com os dois grupos de configurações
// (settingsNavLinks.ts, mesmos grupos dos dois flyouts do Sidebar, aqui
// juntos numa lista só), usada pelas páginas top-level de /settings/*
// (Câmeras, Usuários, Servidor, Aparência, Sobre etc. — não pelas sub-páginas
// por entidade, que já têm sua própria navegação contextual, ex.
// CameraSettingsTabs). Segue o molde de
// ProfileLayout, sobre o Layout novo — não o AppLayout legado. `id`/`footerId`
// são repassados ao Layout pra cada página manter seu id único. Sem
// `.page-content` (largura fluida, sem cap em max-w-7xl) — diferente das
// páginas de coluna única (LivePage/HistoryPage), aqui a coluna de navegação +
// conteúdo aproveita a largura toda da viewport; a margem lateral padrão já
// vem do `contentClassName="p-6"` do Layout.
export default function SettingsLayout({ id, footerId, children }: SettingsLayoutProps) {
  const groups = getRole() === 'admin' ? ADMIN_SETTINGS_GROUPS : VIEWER_SETTINGS_GROUPS

  return (
    <Layout id={id} footerId={footerId} contentClassName="p-6">
      <div id={`${id}-content`} className="flex gap-10">
        {/* mt-11 (44px) alinha o topo da lista com o botão "Eventos" do rail —
            a logo do Sidebar (h-14) + o padding-top do grupo de nav (py-3)
            somam 68px do topo, contra os 24px do p-6 do conteúdo. */}
        <aside id="settings-nav" className="w-48 shrink-0 mt-11">
          <SettingsNavGroups groups={groups} ariaLabel="Configurações" />
        </aside>
        <div id={`${id}-main`} className="min-w-0 flex-1 space-y-4">
          {children}
        </div>
      </div>
    </Layout>
  )
}
