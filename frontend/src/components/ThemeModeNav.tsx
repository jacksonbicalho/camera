import { createPortal } from 'react-dom'
import { useTheme, resolveMode, type Mode } from '../contexts/ThemeContext'
import { useFlyout, navItemClass } from './sidebarFlyout'
import { Check, Moon, Sun } from './Icons'

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Sistema' },
]

// Seletor de modo, na TopBar (id "color-mode" — viveu antes na seção
// "Aparência" do rail vertical, id "theme-nav-current"). O gatilho exibe o
// modo escolhido; clicar abre/fecha as opções num flyout; selecionar aplica
// o modo na hora (setMode), fecha a lista e o gatilho reflete a nova
// seleção. Reusa `useFlyout` (mesmo hook do `MotionNotificationsBell`/
// `AppHelpMenu`) — só-clique (abre no clique do gatilho, fecha no clique
// fora) e já ancora o painel abaixo-à-direita do gatilho.
//
// Já teve um modo hover próprio (`onMouseEnter`/`onMouseLeave`, abria/
// mantinha aberto por hover), removido por causar um bug real reportado
// pelo navigator: cada página monta seu próprio `Layout` (sem layout
// aninhado de rota via `Outlet`), então a `TopBar` remonta a cada
// navegação — e um `mouseenter` só dispara em resposta a movimento real do
// cursor, nunca por causa de uma mudança de DOM. Se o cursor já estava em
// repouso sobre o gatilho no instante do remount (comum, o usuário acabou
// de navegar), hover não funcionava até mover o mouse pra fora e voltar (o
// clique sempre funcionava, por isso parecia "só funciona depois que eu
// clico"). Ver `useFlyout` em `sidebarFlyout.ts` pro detalhe.
//
// O gatilho e o ✓ refletem o modo **escolhido** (`mode`) — incl. "Sistema" —, espelhando
// o radio de Aparência. A resolução de "Sistema" para dark/light (aplicada ao tema) fica
// no ThemeContext; aqui só mostramos a escolha, não o resolvido — exceto pelo ÍCONE do
// gatilho, que usa `resolveMode` pra alternar entre sol/lua (inclusive com "Sistema"
// selecionado, mostra o resolvido no momento, já que não existe um 3º ícone neutro).
export default function ThemeModeNav({ showLabel = true }: { showLabel?: boolean }) {
  const { mode, setMode } = useTheme()
  const { open, setOpen, pos, btnRef, panelRef, toggle } = useFlyout<HTMLButtonElement>()
  const resolved = resolveMode(mode)

  const select = (value: Mode) => {
    setMode(value)
    setOpen(false)
  }

  return (
    <>
      <button
        id="color-mode"
        ref={btnRef}
        type="button"
        title="Estilo"
        aria-label="Estilo"
        onClick={toggle}
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
            ref={panelRef}
            style={{
              position: 'fixed',
              top: pos.top,
              right: pos.right,
              zIndex: 9999,
            }}
            className="w-40 bg-surface border border-border rounded shadow-lg"
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
    </>
  )
}
