import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme, resolveMode, type Mode } from '../contexts/ThemeContext'
import { navItemClass } from './sidebarFlyout'
import { Check, Moon, Sun } from './Icons'

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Sistema' },
]

// Seletor de modo, hoje na TopBar (id "color-mode" — viveu antes na seção
// "Aparência" do rail vertical, id "theme-nav-current"). O gatilho exibe o
// modo escolhido; clicar (ou passar o mouse) abre as opções num flyout;
// selecionar aplica o modo na hora (setMode), fecha a lista e o gatilho
// reflete a nova seleção.
//
// O painel é portalizado pro body com `position: fixed` (coordenadas via
// getBoundingClientRect do gatilho) em vez de `position: absolute` — ancora
// **abaixo-à-direita** do gatilho (mesmo padrão do `UserMenu`), já que o
// gatilho vive perto do canto superior direito da TopBar: um painel `left:
// rect.right` (como quando este componente vivia no rail vertical, com
// espaço garantido à direita) vazaria pra fora da viewport aqui.
// `onMouseEnter`/`onMouseLeave` também vivem no painel portalizado (não só
// no wrapper) pra mover o mouse do gatilho pro painel continuar contando
// como "dentro" — sem gap vertical (`top: rect.bottom + 8`) pra não fechar
// no meio do caminho.
//
// O gatilho e o ✓ refletem o modo **escolhido** (`mode`) — incl. "Sistema" —, espelhando
// o radio de Aparência. A resolução de "Sistema" para dark/light (aplicada ao tema) fica
// no ThemeContext; aqui só mostramos a escolha, não o resolvido — exceto pelo ÍCONE do
// gatilho, que usa `resolveMode` pra alternar entre sol/lua (inclusive com "Sistema"
// selecionado, mostra o resolvido no momento, já que não existe um 3º ícone neutro).
// `onSelect` é chamado após aplicar o modo — usado pelo Sidebar para fechar também
// o popup de configurações pai (não só o flyout interno).
export default function ThemeModeNav({
  showLabel = true,
  onSelect,
}: {
  showLabel?: boolean
  onSelect?: () => void
}) {
  const { mode, setMode } = useTheme()
  const [open, setOpen] = useState(false)
  // Após selecionar, suprime o reabrir-por-hover enquanto o cursor segue sobre o
  // menu — só volta a abrir quando o mouse sai e entra de novo (ou clica no gatilho).
  const [dismissed, setDismissed] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const wrapperRef = useRef<HTMLDivElement>(null)
  const resolved = resolveMode(mode)

  function updatePos() {
    const r = wrapperRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
  }

  function handleEnter() {
    if (dismissed) return
    updatePos()
    setOpen(true)
  }

  function handleLeave() {
    setOpen(false)
    setDismissed(false)
  }

  const select = (value: Mode) => {
    setMode(value)
    setOpen(false)
    setDismissed(true)
    onSelect?.()
  }

  return (
    <div
      ref={wrapperRef}
      id="theme-mode-nav"
      className={showLabel ? 'w-full' : undefined}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        id="color-mode"
        type="button"
        title="Estilo"
        aria-label="Estilo"
        onClick={() => {
          setDismissed(false)
          if (open) {
            setOpen(false)
          } else {
            updatePos()
            setOpen(true)
          }
        }}
        className={navItemClass(open, showLabel)}
      >
        {resolved === 'dark' ? (
          <Moon className="h-5 w-5 shrink-0" />
        ) : (
          <Sun className="h-5 w-5 shrink-0" />
        )}
        {showLabel && <span className="truncate text-sm">Estilo</span>}
      </button>

      {open &&
        createPortal(
          <div
            id="theme-mode-flyout"
            style={{
              position: 'fixed',
              top: pos.top,
              right: pos.right,
              zIndex: 9999,
            }}
            className="w-40 bg-surface border border-border rounded shadow-lg"
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
          >
            {MODE_OPTIONS.map(({ value, label }) => {
              const active = mode === value
              return (
                <button
                  key={value}
                  id={`theme-mode-${value}`}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => select(value)}
                  className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <Check className={`w-4 h-4 shrink-0 ${active ? 'opacity-100' : 'opacity-0'}`} />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}
