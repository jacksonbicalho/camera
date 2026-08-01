import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CameraCapture,
  Download,
  Play,
  Pause,
  Repeat,
  Maximize,
  VolumeX,
  Volume2,
  Gauge,
  MoreVertical,
} from './Icons'
import PlayerFooter from './PlayerFooter'
import Zoom from './Zoom'
import { usePlayerZoom } from '../hooks/usePlayerZoom'
import { usePlayerSnapshot } from '../hooks/usePlayerSnapshot'
import {
  segmentDuration,
  clipTotal,
  globalTime,
  locate,
  formatClock,
  shouldAdvance,
} from '../lib/clipTimeline'

export interface VideoPlayerSegment {
  src: string
  fromSeconds: number
  toSeconds: number // Infinity = até o fim do arquivo
}

// Opções do dropdown de velocidade — potências de 2 até 32x, pensado pra revisão de
// gravação (pular trechos parados rápido), não só o 1.5x/2x de player de mídia comum.
// Ordem de exibição: maior em cima, menor embaixo.
const PLAYBACK_RATES = [32, 16, 8, 4, 2, 1]

// Nem todo browser aceita `playbackRate` tão alto (alguns ignoram/clampam valores acima de
// um teto interno) — detecta suporte real testando num <video> descartável (nunca chega a
// carregar mídia, só o setter/getter do IDL attribute) em vez de assumir que tudo que
// pedimos "pega". Rodado uma vez por sessão (module scope): a capacidade do browser não
// muda entre instâncias do player.
function detectSupportedRates(candidates: number[]): number[] {
  if (typeof document === 'undefined') return candidates
  const probe = document.createElement('video')
  return candidates.filter((rate) => {
    try {
      probe.playbackRate = rate
      return probe.playbackRate === rate
    } catch {
      return false
    }
  })
}
const SUPPORTED_PLAYBACK_RATES = detectSupportedRates(PLAYBACK_RATES)

interface VideoPlayerProps {
  segments: VideoPlayerSegment[]
  idPrefix: string
  autoPlay?: boolean
  repeat?: boolean
  zoom?: boolean
  emptyMessage?: string
  onLoadedData?: () => void
  onError?: () => void
  onPlayingChange?: (playing: boolean) => void
  // Dispara sempre que o segmento ativo muda (transição natural, seek manual ou reinício
  // por loop) — a página chamadora usa isso pra saber qual item da playlist está tocando
  // agora sem duplicar índice/lógica própria (ex.: HistoryPage sincronizando a URL durante
  // a reprodução contínua).
  onSegmentChange?: (index: number) => void
  // O contador "N / M" (`${idPrefix}-segment`) só faz sentido quando os segmentos são
  // recortes de UM evento (VideoBrowserPage, `:motionId` explícito na URL) — aí "M" é a
  // quantidade de chunks que aquele clipe atravessa. Quando os segmentos são gravações
  // INTEIRAS e independentes encadeadas (HistoryPage, reprodução contínua), "N / M" não
  // significa nada pro usuário (não é "parte 2 de uma gravação", é "a 2ª de M gravações
  // distintas na lista") — HistoryPage sempre passa `false` aqui, mesmo com >1 segmento.
  segmentCounter?: boolean
  // Conteúdo extra sobreposto ao player (loading/erro/avisos específicos da página) —
  // renderizado por cima de tudo, sempre, independente do estado interno (aditivo).
  overlay?: ReactNode
  // Conteúdo extra na MESMA linha de controles do rodapé, entre a velocidade e o tempo —
  // extensão específica da página (ex.: switch de reprodução contínua do HistoryPage), sem
  // o motor genérico precisar conhecer esse conceito. Mesmo espírito do `overlay`, mas
  // dentro do rodapé em vez de sobreposto ao vídeo.
  footerExtra?: ReactNode
  // Conteúdo extra alinhado à direita da linha de controles, logo antes do botão de tela
  // cheia (ex.: calendário do HistoryPage) — ponto de extensão irmão do `footerExtra`, só
  // que ancorado no fim da linha em vez de no meio.
  footerTrailing?: ReactNode
  // Conteúdo extra depois do botão de tela cheia — sempre o ÚLTIMO elemento da linha de
  // controles (ex.: CameraViewTabs do HistoryPage). Não precisa de `ml-auto` próprio: anda
  // no fluxo normal logo após o fullscreen, e o `ml-auto` de `footerTrailing` (ou do próprio
  // fullscreen, quando `footerTrailing` está ausente) já empurra o grupo inteiro pra direita.
  footerEnd?: ReactNode
  // Posição do botão de tela cheia na linha de controles. `trailing` (default) — perto do
  // fim da linha, mesmo lugar de sempre (uso do VideoBrowserPage, sem footerExtra/footerEnd,
  // onde o `ml-auto` do próprio botão o empurra pro fim). `afterSpeed` — logo depois do
  // dropdown de velocidade, antes do `footerExtra` (uso do HistoryPage: entre velocidade e
  // o switch de reprodução contínua).
  fullscreenPosition?: 'trailing' | 'afterSpeed'
}

// VideoPlayer — motor de reprodução de N segmentos MP4 em sequência (double-buffering,
// dois <video> empilhados, sem tela preta na fronteira entre chunks — MP4 não-fragmentado,
// MSE não é opção) + barra de controles própria (seek com arraste, play/pause, repeat,
// mute, contador de segmento, fullscreen) e zoom (scroll-to-zoom/drag-to-pan). Extraído do
// VideoBrowserPage para ser reaproveitado pelo HistoryPage — ambos tocam "N segmentos MP4
// com início/fim conhecidos", ao contrário do player ao vivo (Player.tsx — WebRTC/HLS, sem
// seek, modelo de dados diferente e fora de escopo aqui).
export default function VideoPlayer({
  segments,
  idPrefix,
  autoPlay = true,
  repeat = true,
  zoom: zoomEnabled = true,
  emptyMessage,
  onLoadedData,
  onError,
  onPlayingChange,
  onSegmentChange,
  segmentCounter = true,
  overlay,
  footerExtra,
  footerTrailing,
  footerEnd,
  fullscreenPosition = 'trailing',
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const seekBarRef = useRef<HTMLDivElement>(null)
  const elsRef = useRef<(HTMLVideoElement | null)[]>([null, null])
  const heldSegRef = useRef<number[]>([-1, -1]) // segmento que cada elemento carrega (-1 = nenhum)
  const pendingSeekRef = useRef<(number | null)[]>([null, null]) // seek a aplicar no onMeta
  const activeRef = useRef(0) // elemento visível/tocando
  const segmentsRef = useRef<VideoPlayerSegment[]>([])
  const realDurRef = useRef<(number | undefined)[]>([]) // duração real de cada segmento (por índice)
  const durationsRef = useRef<number[]>([]) // duração reproduzível de cada segmento
  const playingRef = useRef(false) // intenção de reprodução (sobrevive à troca de src)
  const scrubbingRef = useRef(false)
  const repeatRef = useRef(false) // loop do clipe ao terminar
  const rateRef = useRef(1) // velocidade de reprodução (sobrevive à troca de src/segmento)

  const [activeEl, setActiveEl] = useState(0)
  const [curSeg, setCurSeg] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true) // muted p/ liberar autoplay sem gesto
  const [repeatOn, setRepeatOn] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  const speedMenuRef = useRef<HTMLDivElement | null>(null)
  // moreOpen — controles secundários (repetir/zoom/snapshot/baixar/velocidade)
  // ficam atrás de um botão "mais" em telas estreitas (<sm); o container que os
  // agrupa alterna `hidden sm:flex` (fechado — CSS esconde só abaixo de `sm`,
  // sempre visível em `sm`+) e `flex` (aberto, independente do breakpoint) —
  // um único conjunto de botões, sem duplicar elementos.
  const [moreOpen, setMoreOpen] = useState(false)
  const [pos, setPos] = useState(0) // posição global (s)
  const [total, setTotal] = useState(0) // duração total do clipe (s)
  const [fullscreen, setFullscreen] = useState(false)

  // `[activeEl]` (o STATE reativo, não `activeRef`) é proposital: `usePlayerZoom` só reaplica
  // a transform CSS quando ESTA função troca de referência (seu próprio useEffect depende
  // dela) — sem essa dependência, trocar de elemento ativo (double-buffering, `advance`/
  // `resetToStart`) nunca reaplicava a transform no elemento que acabou de assumir, mostrando
  // 100% mesmo com o controle de zoom marcando um valor maior. Com `activeEl` na dependência,
  // toda troca de elemento ativo reroda o efeito de `usePlayerZoom` e reaplica o zoom atual —
  // permite `resetToStart`/`advance` pararem de resetar o zoom pra "resolver" esse mismatch.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `activeEl` não é lido no corpo (só
  // `activeRef.current`, sempre fresco por closure) — está aqui só pra FORÇAR uma referência
  // nova a cada troca de elemento ativo, ver comentário acima.
  const getActiveVideoEl = useCallback(() => elsRef.current[activeRef.current], [activeEl])
  const zoom = usePlayerZoom(getActiveVideoEl)
  const { takeSnapshot } = usePlayerSnapshot(getActiveVideoEl)

  const setPlayingIntent = useCallback(
    (v: boolean) => {
      playingRef.current = v
      setPlaying(v)
      onPlayingChange?.(v)
    },
    [onPlayingChange],
  )

  const setCurSegTracked = useCallback(
    (idx: number) => {
      setCurSeg(idx)
      onSegmentChange?.(idx)
    },
    [onSegmentChange],
  )

  // recomputeDurations recalcula as durações reproduzíveis (usa a duração real quando
  // conhecida) e o total do clipe.
  const recomputeDurations = useCallback(() => {
    const d = segmentsRef.current.map((s, i) => segmentDuration(s, realDurRef.current[i]))
    durationsRef.current = d
    setTotal(clipTotal(d))
  }, [])

  // loadInto prepara o elemento com um segmento (src + seek no fromSeconds via onMeta),
  // deixando-o pausado (pré-carregado). Fora de faixa → limpa o elemento.
  const loadInto = useCallback((elIdx: number, segIdx: number) => {
    const el = elsRef.current[elIdx]
    if (!el) return
    const seg = segmentsRef.current[segIdx]
    if (!seg) {
      heldSegRef.current[elIdx] = -1
      el.removeAttribute('src')
      el.load()
      return
    }
    heldSegRef.current[elIdx] = segIdx
    el.src = seg.src
    el.load()
  }, [])

  // Ao carregar a metadata: registra a duração real, posiciona (seek pendente ou
  // fromSeconds); se for o ativo e a intenção é tocar, dá play.
  const onMeta = useCallback(
    (elIdx: number) => {
      const el = elsRef.current[elIdx]
      const segIdx = heldSegRef.current[elIdx]
      const seg = segmentsRef.current[segIdx]
      if (!el || !seg) return
      if (Number.isFinite(el.duration)) {
        realDurRef.current[segIdx] = el.duration
        recomputeDurations()
      }
      const pending = pendingSeekRef.current[elIdx]
      el.currentTime = pending != null ? pending : seg.fromSeconds
      pendingSeekRef.current[elIdx] = null
      // `playbackRate` não é preservado de forma confiável por todo browser através de
      // `el.load()` (reseta pro default em alguns) — reaplica a cada metadata carregada,
      // inclusive nos segmentos seguintes pré-carregados, pra velocidade escolhida
      // atravessar a fronteira entre gravações no modo contínuo.
      el.playbackRate = rateRef.current
      if (elIdx === activeRef.current && playingRef.current) el.play().catch(() => {})
    },
    [recomputeDurations],
  )

  // activate torna o elemento visível e o toca (já pré-carregado no fromSeconds → sem
  // re-seek, evitando flash). Se ainda não tem metadata, o onMeta tocará ao chegar.
  const activate = useCallback(
    (elIdx: number) => {
      activeRef.current = elIdx
      setActiveEl(elIdx)
      setCurSegTracked(heldSegRef.current[elIdx])
      const el = elsRef.current[elIdx]
      if (el && el.readyState >= 1 && playingRef.current) el.play().catch(() => {})
    },
    [setCurSegTracked],
  )

  // resetToStart volta o clipe pro segmento 0/posição 0 (mantém as durações reais já
  // aprendidas — não recomputa do zero) — usado tanto no loop (`repeat` ligado, autoResume
  // = true, toca de novo na hora) quanto ao chegar no fim sem repeat (autoResume = false:
  // fica pausado no início, pronto pro botão de play — em vez de ficar "preso" mostrando a
  // barra cravada no fim, onde apertar play não reproduz nada porque o <video> já está no
  // seu próprio fim).
  const resetToStart = useCallback(
    (autoResume: boolean) => {
      heldSegRef.current = [-1, -1]
      pendingSeekRef.current = [null, null]
      activeRef.current = 0
      setActiveEl(0)
      setCurSegTracked(0)
      setPos(0)
      setPlayingIntent(autoResume)
      // Não reseta mais o zoom aqui — `getActiveVideoEl` (deps `[activeEl]`) já garante que a
      // transform atual é reaplicada no elemento 0 assim que ele volta a ficar ativo (ver
      // comentário na declaração de `getActiveVideoEl`). Reset explícito era um workaround
      // pro mismatch visual que essa troca de dependência resolve na raiz — sem ele, o zoom
      // aplicado pelo usuário sobrevive a um reinício/loop do clipe (bug real, reportado pelo
      // navigator: "ao iniciar uma gravação o zoom volta pro normal 100%").
      loadInto(0, 0)
      loadInto(1, 1)
    },
    [loadInto, setPlayingIntent, setCurSegTracked],
  )

  // advance troca para o próximo segmento (que o outro elemento já pré-carregou) e põe o
  // elemento liberado para pré-carregar o segmento seguinte. O zoom NÃO reseta mais na
  // fronteira — ver comentário em `getActiveVideoEl`/`resetToStart` (mesma causa raiz).
  const advance = useCallback(() => {
    const active = activeRef.current
    const nextSeg = heldSegRef.current[active] + 1
    if (nextSeg >= segmentsRef.current.length) {
      resetToStart(repeatRef.current)
      return
    }
    const other = 1 - active
    if (heldSegRef.current[other] !== nextSeg) loadInto(other, nextSeg)
    activate(other)
    loadInto(active, nextSeg + 1)
  }, [activate, loadInto, resetToStart])

  const onTimeUpdate = useCallback(
    (elIdx: number) => {
      if (elIdx !== activeRef.current) return
      const el = elsRef.current[elIdx]
      const segIdx = heldSegRef.current[elIdx]
      const seg = segmentsRef.current[segIdx]
      if (!el || !seg) return
      // Corte por toSeconds (trail termina no meio do arquivo) OU chegada perto do fim REAL
      // do arquivo (`shouldAdvance`, `lib/clipTimeline.ts`) — cobre o caso de `toSeconds`
      // (vindo de um timestamp de parede, ex.: `end - start` de uma gravação) ser um pouco
      // MAIOR que a duração de fato reproduzível: sem isso, o avanço dependeria só do
      // evento nativo `ended`, que gravações reais não fragmentadas nem sempre disparam de
      // forma confiável.
      if (shouldAdvance(el.currentTime, seg.toSeconds, el.duration)) {
        advance()
        return
      }
      if (!scrubbingRef.current) {
        setPos(globalTime(durationsRef.current, segIdx, el.currentTime - seg.fromSeconds))
      }
    },
    [advance],
  )

  // Fim natural do arquivo: o toSeconds inferido pode passar da duração real (vãos entre
  // chunks) — ao acabar, avança.
  const onEnded = useCallback(
    (elIdx: number) => {
      if (elIdx !== activeRef.current) return
      if (heldSegRef.current[elIdx] + 1 < segmentsRef.current.length) advance()
      else resetToStart(repeatRef.current)
    },
    [advance, resetToStart],
  )

  const togglePlay = useCallback(() => {
    const el = elsRef.current[activeRef.current]
    if (!el) return
    if (playingRef.current) {
      setPlayingIntent(false)
      el.pause()
    } else {
      setPlayingIntent(true)
      el.play().catch(() => {})
    }
  }, [setPlayingIntent])

  const toggleRepeat = useCallback(() => {
    setRepeatOn((r) => {
      repeatRef.current = !r
      return !r
    })
  }, [])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m
      elsRef.current.forEach((el) => {
        if (el) el.muted = next
      })
      return next
    })
  }, [])

  // Aplica a velocidade escolhida no dropdown (SUPPORTED_PLAYBACK_RATES) nos dois
  // elementos do buffer duplo (não só o ativo — o pré-carregado também precisa estar na
  // velocidade certa quando assumir o `z-10`, senão a transição pula de velocidade no meio
  // do clipe). 32x já é filtrado do dropdown quando o browser não suporta
  // (SUPPORTED_PLAYBACK_RATES), mas essa é a rede de segurança: se mesmo assim `el.
  // playbackRate` não "pegar" em 32, cai pra 16x em vez de ficar mostrando "32x" tocando
  // numa velocidade diferente.
  const selectPlaybackRate = useCallback((rate: number) => {
    let applied = rate
    elsRef.current.forEach((el) => {
      if (!el) return
      el.playbackRate = rate
      if (rate === 32 && el.playbackRate !== 32) applied = 16
    })
    if (applied !== rate) {
      elsRef.current.forEach((el) => {
        if (el) el.playbackRate = applied
      })
    }
    rateRef.current = applied
    setPlaybackRate(applied)
    setSpeedMenuOpen(false)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const c = containerRef.current
    if (!c) return
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    else c.requestFullscreen?.().catch(() => {})
  }, [])

  // applySeekNow faz o trabalho de fato: se o segmento alvo já está no elemento ativo, só
  // ajusta o currentTime; senão carrega o alvo (seek manual pode piscar — é ação do
  // usuário) e re-pré-carrega o vizinho.
  const applySeekNow = useCallback(
    (p: number) => {
      const { index, localOffset } = locate(durationsRef.current, p)
      const seg = segmentsRef.current[index]
      if (!seg) return
      const fileTime = seg.fromSeconds + localOffset
      const active = activeRef.current
      if (heldSegRef.current[active] === index) {
        const el = elsRef.current[active]
        if (el) el.currentTime = fileTime
        setCurSegTracked(index)
      } else {
        pendingSeekRef.current[active] = fileTime
        loadInto(active, index)
        setCurSegTracked(index)
        loadInto(1 - active, index + 1)
      }
    },
    [loadInto, setCurSegTracked],
  )

  // seekGlobal posiciona o clipe numa posição global (arraste da barra de progresso própria)
  // — chamado a cada pixel de movimento durante um arraste (dezenas de vezes por segundo).
  // Dentro do MESMO segmento isso vira
  // `el.currentTime = X` a cada chamada: um seek BACKWARD (arrastar da direita pra esquerda,
  // tempo decrescente) custa mais pro decoder que um forward (precisa voltar pro keyframe
  // anterior e decodificar pra frente até o alvo, em vez de só continuar decodificando os
  // próximos frames) — as gravações são copiadas do stream da câmera sem reencode
  // (`internal/recorder`, `-c copy`), então o intervalo de keyframe é o da própria câmera,
  // fora do nosso controle. Um throttle por TEMPO fixo (ex.: 1x por `requestAnimationFrame`,
  // ~60/s) não é suficiente: numa gravação com keyframe distante, um único seek backward já
  // pode levar bem mais que 16ms pra resolver (mais ainda num Raspberry Pi — hardware
  // suportado, ver `make rpi`), e pedir o PRÓXIMO seek antes do anterior terminar força o
  // decoder a abortar/reiniciar repetidamente — pisca em QUALQUER ponto da timeline
  // (reportado pelo navigator), não só perto de fronteira de gravação. Em vez de um
  // intervalo fixo, espera o elemento ativo sinalizar `el.seeking === false` (seek anterior
  // resolvido) antes de aplicar o próximo — ritmo ditado pelo PRÓPRIO decoder, nunca mais
  // rápido do que ele consegue de fato acompanhar, em vez de um teto arbitrário. A posição
  // VISUAL (`pos`, barra/playhead) continua atualizando a cada chamada, instantânea — só o
  // seek de fato no `<video>` espera; a última posição pendente é a que vale (as
  // intermediárias, superadas antes de aplicar, são descartadas).
  const pendingSeekPosRef = useRef<number | null>(null)
  const seekPollRef = useRef<number | null>(null)
  // Ref pro próprio `attemptSeek` — chamado recursivamente (via requestAnimationFrame) de
  // dentro do seu próprio corpo pra reagendar a tentativa; referenciar a função direto
  // criaria um self-reference antes da declaração terminar (`const attemptSeek = useCallback
  // (() => { ...attemptSeek... })`), barrado pelo eslint (react-hooks/immutability). Indireção
  // via ref evita isso sem mudar o comportamento.
  const attemptSeekRef = useRef<() => void>(() => {})
  const attemptSeek = useCallback(() => {
    seekPollRef.current = null
    const target = pendingSeekPosRef.current
    if (target == null) return
    const el = elsRef.current[activeRef.current]
    if (el?.seeking) {
      // Seek anterior ainda em andamento — tenta de novo no próximo frame, sem descartar
      // `target` (pode já ter sido superado por uma chamada mais recente até lá).
      seekPollRef.current = requestAnimationFrame(() => attemptSeekRef.current())
      return
    }
    pendingSeekPosRef.current = null
    applySeekNow(target)
  }, [applySeekNow])
  // Mantém o ref fresco num efeito próprio (não durante o render — `react-hooks/refs` barra
  // mutar refs no corpo do render).
  useEffect(() => {
    attemptSeekRef.current = attemptSeek
  }, [attemptSeek])
  const seekGlobal = useCallback(
    (p: number) => {
      setPos(p)
      pendingSeekPosRef.current = p
      if (seekPollRef.current == null) seekPollRef.current = requestAnimationFrame(attemptSeek)
    },
    [attemptSeek],
  )

  // Barra de progresso própria (div): fração pela posição do ponteiro sobre o track.
  const seekFromClientX = useCallback(
    (clientX: number) => {
      const bar = seekBarRef.current
      if (!bar || total <= 0) return
      const rect = bar.getBoundingClientRect()
      const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      seekGlobal(f * total)
    },
    [seekGlobal, total],
  )

  const onSeekDown = useCallback(
    (e: React.PointerEvent) => {
      scrubbingRef.current = true
      e.currentTarget.setPointerCapture?.(e.pointerId)
      seekFromClientX(e.clientX)
    },
    [seekFromClientX],
  )

  const onSeekMove = useCallback(
    (e: React.PointerEvent) => {
      if (scrubbingRef.current) seekFromClientX(e.clientX)
    },
    [seekFromClientX],
  )

  const onSeekUp = useCallback((e: React.PointerEvent) => {
    scrubbingRef.current = false
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }, [])

  const bindContainer = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node
      if (zoomEnabled) zoom.setContainer(node)
    },
    // `zoom.setContainer` estável — objeto `zoom` inteiro faria esse ref callback trocar de
    // referência a cada zoom, forçando React a desmontar/remontar o ref (chama com `null`
    // depois com o node de novo) e reatar o listener de wheel à toa a cada clique no Zoom.
    [zoomEnabled, zoom.setContainer],
  )

  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // Fecha o dropdown de velocidade ao clicar fora dele — mesmo padrão dos flyouts do resto
  // do app (ex.: Sidebar), só que autocontido aqui (o hook compartilhado é acoplado à
  // posição fixa do rail lateral, não serve pro controle flutuante do player).
  useEffect(() => {
    if (!speedMenuOpen) return
    const onClick = (e: MouseEvent) => {
      if (!speedMenuRef.current?.contains(e.target as Node)) setSpeedMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [speedMenuOpen])

  // startPlayback (re)inicia o motor com uma nova playlist de segmentos (troca de
  // gravação/evento) — recarrega os dois elementos do zero.
  const startPlayback = useCallback(
    (segs: VideoPlayerSegment[]) => {
      segmentsRef.current = segs
      realDurRef.current = new Array(segs.length)
      heldSegRef.current = [-1, -1]
      pendingSeekRef.current = [null, null]
      activeRef.current = 0
      setActiveEl(0)
      setCurSegTracked(0)
      setPos(0)
      recomputeDurations()
      setPlayingIntent(autoPlay)
      if (zoomEnabled) zoom.reset()
      if (segs.length === 0) return
      loadInto(0, 0)
      loadInto(1, 1)
    },
    // `zoom.reset` (estável), não o objeto `zoom` inteiro — CRÍTICO aqui: `startPlayback` é a
    // dependência do efeito logo abaixo, que reinicia o player inteiro (`loadInto` → `el.src`
    // + `el.load()`) sempre que a própria referência de `startPlayback` muda. Com `zoom` no
    // array, TODO clique no zoom (botões novos de `Zoom.tsx`, ou o scroll/pan de sempre)
    // gerava uma referência nova de `zoom` → nova referência de `startPlayback` → o efeito
    // rodava de novo → vídeo reiniciava do zero, em vez de só aplicar o zoom (bug real,
    // reportado pelo navigator testando o pré-push desta história: "ao invés de funcionar,
    // reinicia a reprodução do vídeo").
    [
      autoPlay,
      zoomEnabled,
      zoom.reset,
      loadInto,
      recomputeDurations,
      setPlayingIntent,
      setCurSegTracked,
    ],
  )

  // A página chamadora precisa manter `segments` com referência estável (useMemo/useState)
  // entre renders que não mudam a playlist, senão esse efeito dispara à toa a cada render.
  //
  // startPlayback também seta os <video> reais (loadInto → el.src/el.load()), então só pode
  // rodar depois do commit (refs anexados) — não dá pra virar "ajuste durante o render". O
  // react-hooks/set-state-in-effect não distingue esse caso do anti-padrão de estado
  // derivado que a regra normalmente pega (a checagem é sintática: qualquer setState
  // alcançável a partir do corpo do efeito, mesmo indireto via helper, dispara — só escapa
  // se vier depois de um `await`).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startPlayback(segments)
  }, [segments, startPlayback])

  const hasSegments = segments.length > 0

  const fullscreenButton = (
    <button
      id={`${idPrefix}-fullscreen`}
      type="button"
      onClick={toggleFullscreen}
      className={`flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground${
        fullscreenPosition === 'trailing' && !footerTrailing ? ' ml-auto' : ''
      }`}
      aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
    >
      <Maximize className="h-4 w-4" />
    </button>
  )

  return (
    <div className="flex h-full flex-col">
      <div
        id={idPrefix}
        ref={bindContainer}
        onPointerDown={zoomEnabled ? zoom.onPointerDown : undefined}
        onPointerMove={zoomEnabled ? zoom.onPointerMove : undefined}
        onPointerUp={zoomEnabled ? zoom.onPointerUp : undefined}
        data-on-video
        className={`group relative w-full overflow-hidden rounded-lg border border-border bg-black shadow-sm aspect-video${
          zoomEnabled && zoom.isZoomed ? ' cursor-grab' : ''
        }`}
      >
        {hasSegments ? (
          <>
            {[0, 1].map((i) => (
              <video
                key={i}
                id={i === 0 ? `${idPrefix}-video` : `${idPrefix}-video-b`}
                ref={(el) => {
                  elsRef.current[i] = el
                }}
                muted={muted}
                playsInline
                preload="auto"
                // Transição sem piscada: os DOIS ficam pintados (opacity-1) e a troca é só
                // por z-index — ver comentário original no VideoBrowserPage (removido daqui
                // por brevidade, motivo documentado no cabeçalho do arquivo).
                className={`absolute inset-0 h-full w-full ${
                  activeEl === i ? 'z-10' : 'z-0 pointer-events-none'
                }`}
                onClick={togglePlay}
                onLoadedMetadata={() => onMeta(i)}
                onLoadedData={() => {
                  if (i === activeRef.current) onLoadedData?.()
                }}
                onTimeUpdate={() => onTimeUpdate(i)}
                onEnded={() => onEnded(i)}
                onPlay={() => {
                  if (i === activeRef.current) setPlayingIntent(true)
                }}
                onPause={() => {
                  if (i === activeRef.current) setPlayingIntent(false)
                }}
                onError={() => {
                  if (i === activeRef.current) onError?.()
                }}
              />
            ))}
          </>
        ) : (
          emptyMessage && (
            <div className="flex h-full items-center justify-center text-body text-muted">
              {emptyMessage}
            </div>
          )
        )}
        {overlay}
      </div>

      {(hasSegments || footerExtra || footerTrailing || footerEnd) && (
        // Rodapé de controles ÚNICO — persiste através da troca de segmentos. Sempre
        // visível (não mais um overlay hover sobre o vídeo) e theme-aware, mesmo tratamento
        // do rodapé do Ao vivo (PlayerFooter) — nada de cor fixa tipo bg-black/text-white.
        // `footerExtra` (ex.: reprodução contínua do HistoryPage) renderiza mesmo sem
        // segmentos — o controle em si (ex.: toggle desabilitado) ainda deve aparecer.
        <PlayerFooter id={`${idPrefix}-controls`} freeform>
          {hasSegments && (
            <div className="flex flex-col gap-1 px-3 py-2">
              <div
                id={`${idPrefix}-seek`}
                ref={seekBarRef}
                onPointerDown={onSeekDown}
                onPointerMove={onSeekMove}
                onPointerUp={onSeekUp}
                className="relative flex h-3 cursor-pointer items-center"
                role="slider"
                aria-label="Progresso da reprodução"
                aria-valuemin={0}
                aria-valuemax={Math.round(total)}
                aria-valuenow={Math.round(pos)}
              >
                <div className="h-1 w-full rounded-full bg-foreground/15">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${total > 0 ? (pos / total) * 100 : 0}%` }}
                  />
                </div>
                <div
                  className="absolute h-3 w-3 -translate-x-1/2 rounded-full bg-primary shadow"
                  style={{ left: `${total > 0 ? (pos / total) * 100 : 0}%` }}
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  id={`${idPrefix}-playpause`}
                  type="button"
                  onClick={togglePlay}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  aria-label={playing ? 'Pausar' : 'Reproduzir'}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button
                  id={`${idPrefix}-mute`}
                  type="button"
                  onClick={toggleMute}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  aria-label={muted ? 'Ativar som' : 'Mudo'}
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <button
                  id={`${idPrefix}-more`}
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground sm:hidden"
                  aria-haspopup="true"
                  aria-expanded={moreOpen}
                  aria-label="Mais controles"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                <div
                  id={`${idPrefix}-secondary-controls`}
                  className={
                    moreOpen ? 'flex items-center gap-3' : 'hidden items-center gap-3 sm:flex'
                  }
                >
                  {repeat && (
                    <button
                      id={`${idPrefix}-repeat`}
                      type="button"
                      onClick={toggleRepeat}
                      className={`flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-2 ${
                        repeatOn ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      aria-label="Repetir"
                      aria-pressed={repeatOn}
                    >
                      <Repeat className="h-4 w-4" />
                    </button>
                  )}
                  {zoomEnabled && <Zoom id={idPrefix} zoom={zoom} />}
                  <button
                    id={`${idPrefix}-snapshot`}
                    type="button"
                    onClick={takeSnapshot}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    aria-label="Capturar snapshot"
                  >
                    <CameraCapture className="h-4 w-4" />
                  </button>
                  <a
                    id={`${idPrefix}-download`}
                    href={segments[curSeg]?.src}
                    download
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    aria-label="Baixar gravação"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <div ref={speedMenuRef} className="relative">
                    <button
                      id={`${idPrefix}-speed`}
                      type="button"
                      onClick={() => setSpeedMenuOpen((v) => !v)}
                      className={`flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-full px-1.5 hover:bg-surface-2 ${
                        playbackRate !== 1
                          ? 'text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      aria-haspopup="listbox"
                      aria-expanded={speedMenuOpen}
                      aria-label="Velocidade de reprodução"
                    >
                      <Gauge className="h-4 w-4" />
                      <span className="text-caption tabular-nums">{playbackRate}x</span>
                    </button>
                    {speedMenuOpen && (
                      <div
                        id={`${idPrefix}-speed-menu`}
                        role="listbox"
                        aria-label="Velocidade de reprodução"
                        className="absolute bottom-full left-1/2 z-30 mb-2 flex -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
                      >
                        {SUPPORTED_PLAYBACK_RATES.map((rate) => (
                          <button
                            key={rate}
                            id={`${idPrefix}-speed-${rate}`}
                            type="button"
                            role="option"
                            aria-selected={rate === playbackRate}
                            onClick={() => selectPlaybackRate(rate)}
                            className={`px-4 py-1 text-left text-caption tabular-nums hover:bg-surface-2 ${
                              rate === playbackRate ? 'text-primary' : 'text-foreground'
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {fullscreenPosition === 'afterSpeed' && fullscreenButton}
                {footerExtra}
                <span className="text-caption tabular-nums text-muted-foreground">
                  {formatClock(pos)} / {formatClock(total)}
                </span>
                {segmentCounter && segments.length > 1 && (
                  <span
                    id={`${idPrefix}-segment`}
                    aria-label="Segmento atual"
                    className="text-caption tabular-nums text-faint"
                  >
                    {curSeg + 1} / {segments.length}
                  </span>
                )}
                {footerTrailing && (
                  <div className="ml-auto flex items-center gap-3">{footerTrailing}</div>
                )}
                {fullscreenPosition === 'trailing' && fullscreenButton}
                {footerEnd}
              </div>
            </div>
          )}
          {!hasSegments && (footerExtra || footerTrailing || footerEnd) && (
            <div className="flex items-center gap-3 px-3 py-2">
              {footerExtra}
              {footerTrailing && (
                <div className="ml-auto flex items-center gap-3">{footerTrailing}</div>
              )}
              {footerEnd}
            </div>
          )}
        </PlayerFooter>
      )}
    </div>
  )
}
