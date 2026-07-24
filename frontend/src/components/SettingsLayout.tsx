import type { ReactNode } from 'react'
import Layout from './Layout'

interface SettingsLayoutProps {
  id: string
  footerId?: string
  children: ReactNode
}

// SettingsLayout — envoltório fino de página para as páginas top-level de
// /settings/* (Câmeras, Usuários, Servidor, Aparência, Sobre etc. — não as
// sub-páginas por entidade, que já têm sua própria navegação contextual,
// ex. CameraSettingsTabs). Não tem mais coluna de navegação própria — o
// rail (Sidebar.tsx) já mostra a hierarquia completa de seções sempre
// visível, então uma 2ª coluna idêntica ao lado virou redundância pura
// (pedido do navigator, ao ver as duas colunas lado a lado). `.page-content`
// é só a largura fluida padrão de toda página do `Layout` (ver CLAUDE.md
// "Largura do conteúdo") — sem cap próprio nenhum aqui.
export default function SettingsLayout({ id, footerId, children }: SettingsLayoutProps) {
  return (
    <Layout id={id} footerId={footerId} contentClassName="p-6">
      <div id={`${id}-content`} className="page-content space-y-4">
        {children}
      </div>
    </Layout>
  )
}
