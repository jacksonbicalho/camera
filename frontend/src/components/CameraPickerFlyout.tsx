import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { authHeaders } from '../auth'
import { navItemClass, useFlyout } from './sidebarFlyout'

interface CameraOption {
  id: string
  name: string
}

export interface CameraPickerFlyoutProps {
  id: string
  label: string
  icon: React.ReactNode
  showLabel: boolean
  /** Prefixo de rota que acende o botão como ativo (ex.: "/reports"). */
  activePrefix: string
  /** Constrói a URL de destino a partir do id da câmera clicada. */
  buildTarget: (cameraId: string) => string
}

// CameraPickerFlyout — botão que abre um flyout (mesmo mecanismo de
// SettingsFlyout/UserMenu, ancorado pelo TOPO — ver useFlyout) com a lista de
// câmeras do usuário; clicar numa câmera navega pro destino calculado por
// `buildTarget`. Extraído de Sidebar.tsx (era "CameraListFlyout", uso
// interno) pra ser reaproveitado também fora do rail — ex.: o link
// "Histórico" dentro do menu de Configurações e a aba Relatórios de
// Servidor, que precisam do mesmo seletor sem estar no rail.
export default function CameraPickerFlyout({
  id,
  label,
  icon,
  showLabel,
  activePrefix,
  buildTarget,
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
            {cameras.length === 0 ? (
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
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
