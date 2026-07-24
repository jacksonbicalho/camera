import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { authHeaders } from '../auth'
import { navItemClass, useFlyout } from './sidebarFlyout'

interface CameraOption {
  id: string
  name: string
}

export interface CameraPickerFlyoutProps {
  id: string
  label: string
  icon?: React.ReactNode
  showLabel: boolean
  /** Prefixo de rota que acende o botão como ativo (ex.: "/reports"). */
  activePrefix: string
  /** Constrói a URL de destino a partir do id da câmera clicada. */
  buildTarget: (cameraId: string) => string
  /**
   * "rail" (default) = botão só-ícone/ícone+label do rail (navItemClass,
   * altura fixa h-10). "list" = mesmo estilo de link do SectionNavList
   * (coluna de nav vertical, ex.: SettingsLayout/settings-nav) — sempre
   * mostra o label, sem ícone.
   */
  variant?: 'rail' | 'list'
  /** Chamado depois de navegar (além do próprio fechamento do flyout interno) —
   * usado por quem embrulha este componente num flyout externo (ex.: dentro do
   * flyout de Configurações do Sidebar), pra fechar o flyout externo também. */
  onNavigate?: () => void
}

// Mesmo estilo de item de SettingsNavGroups.tsx (padrão GitHub Settings —
// barra de destaque à esquerda no item ativo) — este componente é o item
// "picker" dessa mesma lista (ver settingsNavLinks.ts), tem que ficar igual
// aos vizinhos.
const listItemClass = (active: boolean) =>
  cn(
    'flex w-full items-center rounded-md border-l-2 py-1.5 pr-3 pl-[10px] text-left text-sm transition-colors',
    active
      ? 'border-primary bg-surface-2 font-medium text-foreground'
      : 'border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground',
  )

// CameraPickerFlyout — botão que abre um flyout (mesmo mecanismo de
// SettingsFlyout/UserMenu, ancorado pelo TOPO — ver useFlyout) com a lista de
// câmeras do usuário; clicar numa câmera navega pro destino calculado por
// `buildTarget`. Extraído de Sidebar.tsx (era "CameraListFlyout", uso
// interno) pra ser reaproveitado também fora do rail — ex.: o link
// "Histórico" dentro do menu de Configurações (variant="list", ver
// SettingsNavGroups) e a aba Relatórios de Servidor, que precisam do mesmo
// seletor sem estar no rail.
export default function CameraPickerFlyout({
  id,
  label,
  icon,
  showLabel,
  activePrefix,
  buildTarget,
  variant = 'rail',
  onNavigate,
}: CameraPickerFlyoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { open, setOpen, pos, btnRef, panelRef, toggle } = useFlyout<HTMLButtonElement>()
  const [cameras, setCameras] = useState<CameraOption[]>([])
  const active = location.pathname.startsWith(activePrefix)

  useEffect(() => {
    if (!open) return
    fetch('/api/cameras', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: CameraOption[]) => setCameras(list))
      .catch(() => {})
  }, [open])

  function selectCamera(cameraId: string) {
    setOpen(false)
    navigate(buildTarget(cameraId))
    onNavigate?.()
  }

  const cameraList =
    cameras.length === 0 ? (
      <p className="px-3 py-1.5 text-xs text-faint">Nenhuma câmera</p>
    ) : (
      cameras.map((c) => (
        <button
          key={c.id}
          id={`${id}-camera-${c.id}`}
          type="button"
          onClick={() => selectCamera(c.id)}
          className="block w-full truncate px-3 py-1.5 text-left text-body text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          {c.name}
        </button>
      ))
    )

  if (variant === 'list') {
    // Sem portal: o painel precisa ficar DENTRO da árvore DOM do botão pra um
    // flyout externo que embrulhe este (ex.: ConfigGroupFlyout, no Sidebar)
    // reconhecer cliques nele como "dentro" — o outside-click do useFlyout
    // externo escuta mousedown no document e fecha se o alvo não estiver
    // dentro do SEU panelRef; um painel portalizado pro body vira irmão
    // desse panelRef, não descendente, e o flyout externo fecha (desmontando
    // este) antes do click completar (bug real, visto com mousedown+click).
    // Mesmo padrão inline de ThemeModeNav/AccentSwatchNav, os outros itens
    // que já vivem dentro desses mesmos flyouts.
    return (
      <div className="relative">
        <button
          id={id}
          ref={btnRef}
          type="button"
          onClick={toggle}
          title={label}
          aria-label={label}
          className={listItemClass(active || open)}
        >
          <span className="truncate text-sm">{label}</span>
        </button>
        {open && (
          <div
            ref={panelRef}
            className="absolute left-full top-0 z-50 ml-1 w-48 rounded-lg border border-border bg-surface py-1 shadow-xl"
          >
            {cameraList}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        id={id}
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={label}
        aria-label={label}
        className={navItemClass(active || open, showLabel)}
      >
        {icon}
        {showLabel && <span className="truncate text-sm">{label}</span>}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
            className="w-48 rounded-lg border border-border bg-surface py-1 shadow-xl"
          >
            {cameraList}
          </div>,
          document.body,
        )}
    </>
  )
}
