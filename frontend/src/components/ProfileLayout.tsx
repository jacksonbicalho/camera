import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import Layout from './Layout'

const PROFILE_NAV_LINKS = [
  { id: 'profile-nav-perfil', to: '/profile', label: 'Perfil' },
  { id: 'profile-nav-senha', to: '/profile/change-password', label: 'Alterar senha' },
]

interface ProfileLayoutProps {
  children: ReactNode
}

// ProfileLayout — layout dedicado ao Perfil (chegada via UserMenu do Sidebar novo): coluna
// esquerda com 2 links (Perfil / Alterar senha) que persistem entre as duas sub-rotas, coluna
// direita = conteúdo. Não reaproveita SettingsLayout/SettingsSidebar (aquele é específico de
// /settings/*, com sua própria lista de links de admin, e usa o AppLayout legado) — aqui são só
// 2 itens, sobre o Layout novo (mesmo rail que trouxe o usuário até aqui).
export default function ProfileLayout({ children }: ProfileLayoutProps) {
  return (
    <Layout id="profile-page" footerId="profile-footer" contentClassName="p-6">
      <div id="profile-content" className="page-content">
        <h1 className="mb-6 text-h1 font-semibold text-foreground">Perfil</h1>
        <div className="flex gap-10">
          <aside className="w-48 shrink-0">
            <nav className="w-full" aria-label="Perfil">
              <ul className="flex flex-col gap-1">
                {PROFILE_NAV_LINKS.map(({ id, to, label }) => (
                  <li key={to}>
                    <NavLink
                      id={id}
                      to={to}
                      end
                      className={({ isActive }) =>
                        `flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-surface-2 font-medium text-foreground'
                            : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                        }`
                      }
                    >
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </Layout>
  )
}
