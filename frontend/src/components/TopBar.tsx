import { Link } from 'react-router-dom'
import UserMenu from './UserMenu'
import ThemeModeNav from './ThemeModeNav'
import MotionNotificationsBell from './MotionNotificationsBell'
import { CameraLogo } from './Icons'

// TopBar — barra fixa no topo do app, full-width (acima da linha Sidebar +
// conteúdo), altura h-14 — mesma altura que a antiga linha de logo dentro do
// Sidebar (pedido do navigator: "ele seguiria a altura de sidebar-logo").
// Logo (link pra "/", à esquerda) e, à direita, o grupo `color-mode` →
// `motion-notifications` → `UserMenu` (avatar) — o meio fica vazio DE
// PROPÓSITO, reservado pra elementos futuros (breadcrumbs, busca, etc. —
// "no futuro colocaremos elementos nele"). `ThemeModeNav`
// (`MotionNotificationsBell`) migraram pra cá vindos da seção "Aparência"
// ("Eventos") do `Sidebar` — os dois usam `showLabel={false}` (ícone só,
// igual ao `UserMenu`) e ancoram o próprio flyout abaixo-à-direita do
// gatilho (mesmo padrão do `UserMenu`), não mais à direita como faziam no
// rail vertical — aqui, perto do canto superior direito, um painel `left:
// rect.right` vazaria pra fora da viewport.
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
        id="logo-app"
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        title="os-camera"
      >
        <CameraLogo className="w-8 h-8 shrink-0" />
        <span className="text-base font-bold text-foreground truncate">os-camera</span>
      </Link>
      <div className="flex items-center gap-1">
        <ThemeModeNav showLabel={false} />
        <MotionNotificationsBell showLabel={false} />
        <UserMenu />
      </div>
    </div>
  )
}
