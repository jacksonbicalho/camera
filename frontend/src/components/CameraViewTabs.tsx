import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface CameraViewTabsProps {
  cameraId: string
  active: 'live' | 'history'
}

// h-full (não py-1.5): a pílula tem altura FIXA (h-8, ver <nav>) igual ao line-height do
// título (text-h1/text-2xl, 2rem) — antes a altura vinha só do padding vertical do botão,
// maior que a do título, e o `items-center` do PageHeader centralizava as duas caixas com
// alturas bem diferentes, dando a impressão de desalinhamento (o texto do título, com seu
// próprio leading interno, ficava visualmente mais baixo que a pílula).
const label =
  'relative z-10 flex-1 flex h-full items-center justify-center gap-1.5 whitespace-nowrap px-4 text-body font-medium transition-colors'
const activeLabelCls = 'text-foreground'
const idleLabelCls = 'text-muted-foreground hover:text-foreground'

// Duração do slide da pílula — a navegação real só acontece depois que a
// animação termina (ver handleClick), pra dar tempo do usuário ver o
// movimento antes da página trocar.
const SLIDE_MS = 220

// CameraViewTabs — menu segmentado "Ao vivo | Histórico" no topo das páginas de
// câmera (LivePage, HistoryPage). Alterna entre o ao-vivo e o histórico da mesma
// câmera; a aba ativa é marcada com aria-current e vira um <span> — não um link —
// já que clicar nela de novo não levaria a lugar nenhum (já é a página atual). O
// dot da aba "Ao vivo" só fica verde e pulsa quando ela está ativa (cinza,
// estático, quando inativa) — vira status real ("streamando agora"), não decoração.
// Verde (não vermelho): vermelho já é o REC (gravando) — usar a mesma cor pros dois
// sinais diferentes confundiria; o dot do REC usa o mesmo tamanho do "Ao vivo" ativo
// (h-2.5 w-2.5) pra ficarem visualmente parelhos.
//
// Animação de troca: "Ao vivo" e "Histórico" são rotas separadas (sem DOM
// persistente entre elas) — a View Transitions API do browser não dá conta disso
// de forma confiável aqui (o <BrowserRouter> declarativo deste app não suporta o
// prop `viewTransition` do <Link>, e mesmo disparando `document.startViewTransition`
// na mão, o resultado depende de suporte de browser). Em vez disso, a pílula de
// fundo (`camera-tab-glider`) é um elemento **local**, sempre presente nas duas
// abas — ao clicar, ela desliza via `transform: translateX` (CSS puro, garantido
// em qualquer browser) dentro da página atual, e só então a navegação real
// acontece (após SLIDE_MS) — o usuário vê o movimento antes da troca de rota.
export default function CameraViewTabs({ cameraId, active }: CameraViewTabsProps) {
  const navigate = useNavigate()
  // displayActive é o estado VISUAL da pílula — atualiza no clique, antes da
  // navegação de verdade, pra tocar a animação. Ressincroniza com `active`
  // durante o render (padrão "adjusting state when a prop changes" do React,
  // em vez de um useEffect com setState — evita um render extra) sempre que a
  // rota mudar por fora do clique (ex.: botão voltar do browser).
  const [displayActive, setDisplayActive] = useState(active)
  const [prevActive, setPrevActive] = useState(active)
  if (active !== prevActive) {
    setPrevActive(active)
    setDisplayActive(active)
  }
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  function handleClick(to: string, target: 'live' | 'history') {
    if (timerRef.current) clearTimeout(timerRef.current)
    setDisplayActive(target)
    timerRef.current = setTimeout(() => navigate(to), SLIDE_MS)
  }

  const liveDot = (
    <span
      id="camera-tab-live-dot"
      className={cn(
        'rounded-full',
        active === 'live'
          ? 'h-2.5 w-2.5 animate-pulse bg-success'
          : 'h-1.5 w-1.5 bg-muted-foreground',
      )}
    />
  )

  return (
    <nav
      id="camera-view-tabs"
      aria-label="Visão da câmera"
      className="relative flex h-8 items-center rounded-full border border-border bg-foreground/8 p-1"
    >
      <span
        id="camera-tab-glider"
        aria-hidden="true"
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-surface ring-1 ring-border shadow-sm transition-transform ease-out"
        style={{
          transitionDuration: `${SLIDE_MS}ms`,
          transform: displayActive === 'history' ? 'translateX(100%)' : 'translateX(0%)',
        }}
      />
      {active === 'live' ? (
        <span
          id="camera-tab-live"
          aria-label="Ao vivo"
          aria-current="page"
          className={cn(label, activeLabelCls)}
        >
          {liveDot} Ao vivo
        </span>
      ) : (
        <Link
          id="camera-tab-live"
          to={`/live/${cameraId}`}
          aria-label="Ao vivo"
          className={cn(label, idleLabelCls)}
          onClick={(e) => {
            e.preventDefault()
            handleClick(`/live/${cameraId}`, 'live')
          }}
        >
          {liveDot} Ao vivo
        </Link>
      )}
      {active === 'history' ? (
        <span
          id="camera-tab-history"
          aria-label="Histórico"
          aria-current="page"
          className={cn(label, activeLabelCls)}
        >
          Histórico
        </span>
      ) : (
        <Link
          id="camera-tab-history"
          to={`/history/${cameraId}`}
          aria-label="Histórico"
          className={cn(label, idleLabelCls)}
          onClick={(e) => {
            e.preventDefault()
            handleClick(`/history/${cameraId}`, 'history')
          }}
        >
          Histórico
        </Link>
      )}
    </nav>
  )
}
