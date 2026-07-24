import { Link } from 'react-router-dom'
import UserMenu from './UserMenu'
import { CameraLogo } from './Icons'

// TopBar — barra fixa no topo do app, full-width (acima da linha Sidebar +
// conteúdo), altura h-14 — mesma altura que a antiga linha de logo dentro do
// Sidebar (pedido do navigator: "ele seguiria a altura de sidebar-logo").
// Hoje só tem o logo (link pra "/", à esquerda) e o UserMenu (avatar, à
// direita) — o meio fica vazio DE PROPÓSITO, reservado pra elementos futuros
// (breadcrumbs, busca, etc. — "no futuro colocaremos elementos nele").
// Substitui: (1) a linha de logo que vivia dentro do próprio `Sidebar.tsx`
// (agora só a coluna de navegação, sem cabeçalho próprio); (2) o `UserMenu`
// fixo/flutuante (`position: fixed`), que colidia visualmente com botões de
// ação no canto superior direito das páginas (`PageHeader`) — agora ele é só
// mais um item em fluxo dentro desta barra.
export default function TopBar() {
  return (
    <div
      id="top-bar"
      className="sticky top-0 z-20 flex h-14 flex-none items-center justify-between border-b border-border bg-surface px-4"
    >
      <Link
        to="/"
        id="sidebar-logo"
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        title="os-camera"
      >
        <CameraLogo className="w-8 h-8 shrink-0" />
        <span className="text-base font-bold text-foreground truncate">os-camera</span>
      </Link>
      <UserMenu />
    </div>
  )
}
