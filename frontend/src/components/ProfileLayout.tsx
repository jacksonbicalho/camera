import type { ReactNode } from 'react'
import Layout from './Layout'
import PageHeader from './PageHeader'
import SectionNavList from './SectionNavList'

const PROFILE_NAV_LINKS = [
  { id: 'profile-nav-perfil', to: '/profile', label: 'Perfil' },
  { id: 'profile-edit-email', to: '/profile/change-email', label: 'Alterar e-mail' },
  { id: 'profile-edit-senha', to: '/profile/change-password', label: 'Alterar senha' },
]

interface ProfileLayoutProps {
  children: ReactNode
}

// ProfileLayout — layout dedicado ao Perfil (chegada via UserMenu do Sidebar novo): coluna
// esquerda com 3 links (Perfil / Alterar e-mail / Alterar senha, ids profile-nav-perfil /
// profile-edit-email / profile-edit-senha) que persistem entre as sub-rotas, coluna direita =
// conteúdo (ProfilePage, montado em /profile, /profile/edit e /profile/change-email — ver
// padrão de edição via rota dedicada no CLAUDE.md). Não reaproveita SettingsLayout/
// SettingsSidebar (aquele é específico de /settings/*, com sua própria lista de links de admin,
// e usa o AppLayout legado) — aqui são só os 3 itens acima, sobre o Layout novo (mesmo rail que
// trouxe o usuário até aqui).
export default function ProfileLayout({ children }: ProfileLayoutProps) {
  return (
    <Layout id="profile-page" footerId="profile-footer" contentClassName="p-6">
      <div id="profile-content" className="page-content">
        <PageHeader id="profile-header" title="Perfil" />
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
          <aside className="w-full lg:w-48 lg:shrink-0">
            <SectionNavList items={PROFILE_NAV_LINKS} ariaLabel="Perfil" end />
          </aside>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </Layout>
  )
}
