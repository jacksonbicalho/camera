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

// Altura estimada do painel (3 opções, cada uma py-2 + text-sm ≈ 36px, + bordas) —
// determinística (número fixo de opções, sem conteúdo dinâmico), então dá pra
// calcular sem medir o DOM depois de montado.
const PANEL_HEIGHT = MODE_OPTIONS.length * 36 + 2

// Seletor de modo para o rail (Sidebar, seção "Aparência"). O gatilho exibe o
// modo escolhido; clicar (ou passar o mouse) abre as opções num flyout à
// direita; selecionar aplica o modo na hora (setMode), fecha a lista e o
// gatilho reflete a nova seleção.
//
// O painel é portalizado pro body com `position: fixed` (coordenadas via
// getBoundingClientRect do gatilho) em vez de `position: absolute` dentro do
// próprio wrapper — o Sidebar tem `overflow-y-auto` (rola quando as seções
// excedem a altura da viewport) e um painel `absolute` ficaria clipado por
// esse container (bug real, visto no navegador: o flyout abria mas ficava
// escondido atrás do corte do scroll). `onMouseEnter`/`onMouseLeave` também
// vivem no painel portalizado (não só no wrapper) pra mover o mouse do
// gatilho pro painel continuar contando como "dentro" — sem gap entre os
// dois (`left: rect.right`, sem margem) pra não fechar no meio do caminho.
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
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0 })
  const wrapperRef = useRef<HTMLDivElement>(null)
  const resolved = resolveMode(mode)

  // "Inteligente": abre pra baixo (ancorado no topo do gatilho) normalmente, mas
  // quando não sobra espaço suficiente até o fim da viewport (gatilho perto do
  // rodapé do rail, ex.: seção "Aparência" é uma das últimas) inverte e ancora
  // pelo fundo — sem isso o painel abria pra baixo incondicionalmente e ficava
  // cortado pela borda da tela (bug real, visto no navegador: opção "Sistema"
  // ficava invisível, fora da viewport).
  function updatePos() {
    const r = wrapperRef.current?.getBoundingClientRect()
    if (!r) return
    const spaceBelow = window.innerHeight - r.top
    if (spaceBelow < PANEL_HEIGHT) {
      setPos({ left: r.right, bottom: window.innerHeight - r.bottom })
    } else {
      setPos({ left: r.right, top: r.top })
    }
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
        id="theme-nav-current"
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
              left: pos.left,
              ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
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
