import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, fireEvent } from '@testing-library/react'
import HistoryTimeline from './HistoryTimeline'
import type { Recording } from '../pages/cameraUtils'
import type { RecordingCategory } from '../pages/eventCategory'
import { computeHourLayout, evenFractions, hourBoxWidthPx } from './timelineScale'

vi.mock('../auth', () => ({ getToken: () => 'fake-token' }))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function item(
  id: number,
  start: string,
  category: RecordingCategory,
): { rec: Recording; category: RecordingCategory } {
  return {
    rec: {
      id,
      filename: `${id}.mp4`,
      start,
      url: `/recordings/cam1/${id}.mp4`,
      is_recording: false,
      has_motion: false,
    },
    category,
  }
}

// Mesmas medidas do componente (HistoryTimeline.tsx) — duplicadas aqui (não importadas)
// porque são detalhe de implementação privado do componente; os testes só conhecem o
// contrato público (funções puras de timelineScale.ts, já testadas isoladamente com
// valores hardcoded em timelineScale.test.ts) + estas medidas.
const LINE_WIDTH_PX = 5
const LINE_GAP_PX = 2.5
const CARD_GAP_PX = 18
const CARD_PADDING_PX = 24

// linePixelPositionsFor replica o cálculo de posição RENDERIZADA de cada linha — a MESMA
// lógica de produção (HistoryTimeline.tsx: agrupa por hora, calcula a largura de cada card
// via `hourBoxWidthPx`, o layout via `computeHourLayout`, e a posição de cada linha DENTRO
// do card via `evenFractions`, por ÍNDICE cronológico), usando só funções puras já testadas
// isoladamente. Usado pra prever, nos testes de interação (clique/arraste/preview), a
// posição em pixel exata de uma gravação específica — sem números mágicos, e sem depender
// de medir o DOM (jsdom não faz layout de verdade).
function linePixelPositionsFor(items: { rec: Recording }[]): Map<number, number> {
  const byHour = new Map<number, typeof items>()
  for (const it of items) {
    const h = new Date(it.rec.start).getHours()
    const list = byHour.get(h)
    if (list) list.push(it)
    else byHour.set(h, [it])
  }
  const hours = [...byHour.keys()].sort((a, b) => a - b)
  const widths: number[] = []
  const perHour: { items: typeof items; positions: Map<number, number> }[] = []
  for (const hour of hours) {
    const hourItems = byHour.get(hour)!
    // Sem piso mínimo (`minWidthPx: 0`) — mesma medida de produção: um card já fechado
    // (não recebe mais gravações) não reserva espaço além do necessário.
    const width = hourBoxWidthPx(hourItems.length, LINE_WIDTH_PX, LINE_GAP_PX, CARD_PADDING_PX, 0)
    // Posição por ÍNDICE cronológico (não por horário real) — mesma lógica de produção
    // (HistoryTimeline.tsx): a primeira e a última linha de TODO card sempre encostam na
    // mesma distância da borda (o padding), e o espaçamento entre vizinhas é sempre
    // uniforme, independente de quão perto/longe estejam no tempo real.
    const sortedIds = [...hourItems]
      .sort((a, b) => Date.parse(a.rec.start) - Date.parse(b.rec.start))
      .map((it) => it.rec.id)
    const positions = evenFractions(sortedIds)
    widths.push(width)
    perHour.push({ items: hourItems, positions })
  }
  const layout = computeHourLayout(widths, CARD_GAP_PX)
  const result = new Map<number, number>()
  perHour.forEach((h, i) => {
    // Recuada por `CARD_PADDING_PX/2` de cada lado — mesmo wrapper interno do render (ver
    // HistoryTimeline.tsx): sem esse recuo, uma linha em frac≈1 renderizaria colada na
    // borda direita do card em vez de manter a folga do padding.
    const contentWidth = widths[i] - CARD_PADDING_PX
    for (const it of h.items) {
      const clamped = h.positions.get(it.rec.id)!
      result.set(it.rec.id, layout.offsets[i] + CARD_PADDING_PX / 2 + clamped * contentWidth)
    }
  })
  return result
}

// pixelForId devolve o clientX (relativo à trilha, `left: 0` mockado por `mockTrackRect`)
// da posição RENDERIZADA da gravação `id`.
function pixelForId(items: { rec: Recording }[], id: number): number {
  return linePixelPositionsFor(items).get(id)!
}

// mockTrackRect dá um retângulo determinístico à trilha — jsdom não faz layout de
// verdade, então getBoundingClientRect() sempre devolve zeros sem isso. A largura em si
// não importa pro cálculo de posição (que hoje vem só de `items`, determinístico) — só
// precisa ser > 0 pra passar o guard de "elemento ainda não renderizado" e ter `left: 0`
// pra não deslocar as contas de `pixelForId`.
function mockTrackRect() {
  const track = document.getElementById('history-timeline-track')!
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width: 100000,
    top: 0,
    right: 100000,
    bottom: 24,
    height: 24,
    x: 0,
    y: 0,
    toJSON() {
      return {}
    },
  } as DOMRect)
  return track
}

describe('HistoryTimeline', () => {
  describe('Renderização de horas vazias', () => {
    describe('CA2: hora sem gravação não aparece; régua com `day` mas sem gravações continua visível', () => {
      it('hora sem nenhuma gravação NÃO renderiza card nenhum (pedido do navigator: horas vazias somem, não ocupam espaço)', () => {
        const items = [item(1, '2026-07-05T07:12:00Z', 'continua')]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        expect(document.getElementById('history-timeline-hour-7')).not.toBeNull()
        expect(document.getElementById('history-timeline-hour-0')).toBeNull()
        expect(document.getElementById('history-timeline-hour-23')).toBeNull()
      })

      it('sem nenhuma gravação e sem `day`, não renderiza nada', () => {
        const { container } = render(
          <HistoryTimeline recordingItems={[]} onSelect={vi.fn()} cameraId="cam1" />,
        )
        expect(container.firstChild).toBeNull()
      })

      it('com `day` explícito, sem NENHUMA gravação a régua ainda aparece (resumo "0 gravações" + trilha vazia) — não desaparece; mas nenhum card de hora é renderizado', () => {
        render(
          <HistoryTimeline
            recordingItems={[]}
            onSelect={vi.fn()}
            cameraId="cam1"
            day={new Date('2026-07-05T12:00:00Z')}
          />,
        )
        expect(document.getElementById('history-timeline-track')).not.toBeNull()
        expect(document.getElementById('history-timeline-headers')).not.toBeNull()
        expect(document.getElementById('history-timeline-track')!.children.length).toBe(0)
        expect(document.getElementById('history-timeline-summary')!.textContent).toBe('0 gravações')
      })
    })
  })

  describe('Cabeçalhos de hora', () => {
    describe('CA4: cada card ganha cabeçalho próprio com a hora e a contagem, alinhado à trilha', () => {
      it('cada card ganha um cabeçalho próprio com a hora e a contagem de gravações daquela hora', () => {
        const items = [
          item(1, '2026-07-05T07:12:00Z', 'continua'),
          item(2, '2026-07-05T18:03:00Z', 'movimento'),
          item(3, '2026-07-05T18:20:00Z', 'pessoa'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        expect(document.getElementById('history-timeline-hour-7-header')!.textContent).toBe(
          '7h · 1 gravação',
        )
        expect(document.getElementById('history-timeline-hour-18-header')!.textContent).toBe(
          '18h · 2 gravações',
        )
      })

      it('só as horas COM gravação ganham cabeçalho — horas vazias não aparecem nem aqui', () => {
        const items = [item(1, '2026-07-05T07:12:00Z', 'continua')]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        expect(document.getElementById('history-timeline-hour-7-header')).not.toBeNull()
        expect(document.getElementById('history-timeline-headers')!.children.length).toBe(1)
      })

      it('os cabeçalhos usam o MESMO gap/largura por coluna da trilha abaixo — sem isso desalinhariam sob o card correspondente', () => {
        const items = [
          item(1, '2026-07-05T07:12:00Z', 'continua'),
          item(2, '2026-07-05T18:00:00Z', 'movimento'),
          item(3, '2026-07-05T18:05:00Z', 'movimento'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        expect(document.getElementById('history-timeline-headers')!.style.gap).toBe('18px')
        // Hora 18 (2 gravações, card mais largo que o mínimo) — cabeçalho e card de baixo
        // continuam com a MESMA largura entre si.
        expect(document.getElementById('history-timeline-hour-18-header')!.style.width).toBe(
          document.getElementById('history-timeline-hour-18')!.style.width,
        )
      })
    })
  })

  describe('Seleção por clique na trilha', () => {
    describe('CA3: clique na trilha seleciona a gravação mais próxima do instante clicado', () => {
      it('clique na trilha seleciona a gravação mais próxima daquele instante', () => {
        const onSelect = vi.fn()
        const items = [
          item(2, '2026-07-05T18:20:00Z', 'pessoa'),
          item(1, '2026-07-05T18:03:00Z', 'movimento'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
        mockTrackRect()
        fireEvent.click(document.getElementById('history-timeline-track')!, {
          clientX: pixelForId(items, 1),
        })
        expect(onSelect).toHaveBeenCalledWith(1)
      })
    })

    describe('CA5: clique fora de qualquer card (antes/depois da trilha, no gap) não seleciona nada', () => {
      it('clique perto de outro instante seleciona uma gravação diferente da mais próxima anterior — não é sempre a primeira da hora', () => {
        const onSelect = vi.fn()
        const items = [
          item(2, '2026-07-05T18:20:00Z', 'pessoa'),
          item(1, '2026-07-05T18:03:00Z', 'movimento'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
        mockTrackRect()
        fireEvent.click(document.getElementById('history-timeline-track')!, {
          clientX: pixelForId(items, 2),
        })
        expect(onSelect).toHaveBeenCalledWith(2)
      })

      it('clique antes do início da trilha (clientX negativo) não seleciona nada — fora de qualquer card, sem "grudar" numa gravação distante', () => {
        // Pedido do navigator: a ação do mouse/ponteiro só responde EM CIMA de um card —
        // clicar bem antes do 1º card (fora de qualquer um) não deve selecionar nada.
        const onSelect = vi.fn()
        const items = [
          item(2, '2026-07-05T18:00:00Z', 'movimento'),
          item(1, '2026-07-05T05:00:00Z', 'continua'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
        mockTrackRect()
        fireEvent.click(document.getElementById('history-timeline-track')!, { clientX: -500 })
        expect(onSelect).not.toHaveBeenCalled()
      })

      it('clique depois do fim da trilha (clientX além da largura) não seleciona nada — fora de qualquer card', () => {
        const onSelect = vi.fn()
        const items = [
          item(2, '2026-07-05T18:00:00Z', 'movimento'),
          item(1, '2026-07-05T05:00:00Z', 'continua'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
        mockTrackRect()
        fireEvent.click(document.getElementById('history-timeline-track')!, { clientX: 999999 })
        expect(onSelect).not.toHaveBeenCalled()
      })

      it('clique no GAP entre dois cards (não sobre nenhum deles) não seleciona nada', () => {
        const onSelect = vi.fn()
        const items = [
          item(1, '2026-07-05T05:00:00Z', 'continua'),
          item(2, '2026-07-05T18:00:00Z', 'movimento'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
        mockTrackRect()
        // Cada hora tem só 1 gravação → card no tamanho exato de 1 linha (sem piso mínimo, ver
        // `hourBoxWidthPx`), e a linha única de cada hora fica em frac 0% — mas RECUADA por
        // `CARD_PADDING_PX/2` do início do card (ver o wrapper interno em HistoryTimeline.tsx),
        // então `pixelForId` (que já aplica esse recuo) não é a borda esquerda do card, e sim
        // `card.start + CARD_PADDING_PX/2`. O fim real do card 1 é
        // `(px1 - CARD_PADDING_PX/2) + singleItemWidth`; o início real do card 2 é
        // `px2 - CARD_PADDING_PX/2` — o meio do gap real fica entre os dois.
        const singleItemWidth = hourBoxWidthPx(1, LINE_WIDTH_PX, LINE_GAP_PX, CARD_PADDING_PX, 0)
        const px1 = pixelForId(items, 1)
        const px2 = pixelForId(items, 2)
        const card1End = px1 - CARD_PADDING_PX / 2 + singleItemWidth
        const card2Start = px2 - CARD_PADDING_PX / 2
        const gapMid = (card1End + card2Start) / 2
        fireEvent.click(document.getElementById('history-timeline-track')!, { clientX: gapMid })
        expect(onSelect).not.toHaveBeenCalled()
      })
    })
  })

  describe('Preview ao passar o mouse (hover)', () => {
    describe('CA4: hover mostra preview com miniatura e horário, sem exigir clique', () => {
      it('mover o mouse sobre a trilha mostra um preview com miniatura e o horário, sem exigir clique', () => {
        vi.useFakeTimers()
        const items = [item(1, '2026-07-05T18:03:00Z', 'movimento')]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        mockTrackRect()

        expect(document.getElementById('history-timeline-preview')).toBeNull()

        fireEvent.mouseMove(document.getElementById('history-timeline-track')!, {
          clientX: pixelForId(items, 1),
        })
        // A imagem/horário só aparece depois do mouse "descansar" (debounce) — ver comentário
        // de PREVIEW_DEBOUNCE_MS em HistoryTimeline.tsx: sem isso, cada mousemove bateria no
        // event-frame (que spawna ffmpeg no backend).
        expect(document.getElementById('history-timeline-preview')).toBeNull()
        act(() => vi.advanceTimersByTime(200))

        const preview = document.getElementById('history-timeline-preview')!
        expect(preview).not.toBeNull()
        expect(preview.textContent).toContain('18:03')
        const img = preview.querySelector('img')!
        expect(img.getAttribute('src')).toContain('/api/cameras/cam1/event-frame')
        expect(img.getAttribute('src')).toContain('token=fake-token')
      })

      it('sem nenhum card renderizado (dia vazio), o preview NÃO aparece', () => {
        vi.useFakeTimers()
        render(
          <HistoryTimeline
            recordingItems={[]}
            onSelect={vi.fn()}
            cameraId="cam1"
            day={new Date('2026-07-05T12:00:00Z')}
          />,
        )
        mockTrackRect()
        fireEvent.mouseMove(document.getElementById('history-timeline-track')!, { clientX: 50 })
        act(() => vi.advanceTimersByTime(200))
        expect(document.getElementById('history-timeline-preview')).toBeNull()
      })

      it('mousemove contínuo reinicia o debounce — não busca uma imagem por posição intermediária', () => {
        vi.useFakeTimers()
        const onFrameRequests: string[] = []
        const items = [
          item(1, '2026-07-05T12:00:00Z', 'continua'),
          item(2, '2026-07-05T13:00:00Z', 'continua'),
          item(3, '2026-07-05T14:00:00Z', 'continua'),
          item(4, '2026-07-05T18:03:00Z', 'movimento'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        mockTrackRect()
        const track = document.getElementById('history-timeline-track')!

        // Move o mouse por várias posições intermediárias em rápida sucessão (< debounce entre
        // cada uma) — só a ÚLTIMA posição deve gerar preview, nunca as intermediárias.
        for (const id of [1, 2, 3, 4]) {
          fireEvent.mouseMove(track, { clientX: pixelForId(items, id) })
          act(() => vi.advanceTimersByTime(50)) // < PREVIEW_DEBOUNCE_MS — nenhum preview deve ter disparado ainda
          expect(document.getElementById('history-timeline-preview')).toBeNull()
        }
        act(() => vi.advanceTimersByTime(200))
        const preview = document.getElementById('history-timeline-preview')!
        expect(preview.textContent).toContain('18:03')
        const img = preview.querySelector('img')!
        onFrameRequests.push(img.getAttribute('src')!)
        // Só 1 URL de preview foi de fato renderizada (a última posição) — nunca uma pras
        // posições intermediárias descartadas pelo debounce.
        expect(onFrameRequests).toHaveLength(1)
      })

      it('sair do hover (mouseleave) esconde o preview', () => {
        vi.useFakeTimers()
        const items = [item(1, '2026-07-05T18:03:00Z', 'movimento')]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        mockTrackRect()
        const track = document.getElementById('history-timeline-track')!
        fireEvent.mouseMove(track, { clientX: pixelForId(items, 1) })
        act(() => vi.advanceTimersByTime(200))
        expect(document.getElementById('history-timeline-preview')).not.toBeNull()
        fireEvent.mouseLeave(track)
        expect(document.getElementById('history-timeline-preview')).toBeNull()
      })

      it('imagem de preview que falha mostra "sem prévia" em vez de manter a miniatura quebrada', () => {
        vi.useFakeTimers()
        const items = [item(1, '2026-07-05T18:03:00Z', 'movimento')]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        mockTrackRect()
        const track = document.getElementById('history-timeline-track')!
        fireEvent.mouseMove(track, { clientX: pixelForId(items, 1) })
        act(() => vi.advanceTimersByTime(200))
        const img = document.querySelector('#history-timeline-preview img')!
        fireEvent.error(img)
        expect(document.getElementById('history-timeline-preview')!.textContent).toContain(
          'sem prévia',
        )
      })
    })
  })

  describe('Arraste e clique na alça (handle)', () => {
    describe('CA4: arrastar a alça atualiza posição/preview, sem selecionar durante o arraste', () => {
      it('arrastar a alça atualiza a posição/preview, sem chamar onSelect durante o arraste', () => {
        vi.useFakeTimers()
        const onSelect = vi.fn()
        const items = [
          item(1, '2026-07-05T05:00:00Z', 'continua'),
          item(2, '2026-07-05T18:00:00Z', 'movimento'),
        ]
        render(
          <HistoryTimeline
            recordingItems={items}
            onSelect={onSelect}
            cameraId="cam1"
            selectedId={1}
          />,
        )
        mockTrackRect()
        const handle = document.getElementById('history-timeline-handle')!
        fireEvent.pointerDown(handle, { clientX: pixelForId(items, 1), pointerId: 1 })
        fireEvent.pointerMove(handle, {
          clientX: (pixelForId(items, 1) + pixelForId(items, 2)) / 2,
          pointerId: 1,
        })
        fireEvent.pointerMove(handle, { clientX: pixelForId(items, 2), pointerId: 1 })
        // Nenhuma troca de gravação durante o arraste — só ao soltar (CA5drag).
        expect(onSelect).not.toHaveBeenCalled()

        act(() => vi.advanceTimersByTime(200))
        const preview = document.getElementById('history-timeline-preview')
        expect(preview?.textContent).toContain('18:00')
      })
    })

    describe('CA5: soltar a alça seleciona a gravação mais próxima da posição final', () => {
      it('soltar a alça seleciona a gravação mais próxima da posição final, exatamente uma vez', () => {
        const onSelect = vi.fn()
        const items = [
          item(1, '2026-07-05T05:00:00Z', 'continua'),
          item(2, '2026-07-05T18:00:00Z', 'movimento'),
        ]
        render(
          <HistoryTimeline
            recordingItems={items}
            onSelect={onSelect}
            cameraId="cam1"
            selectedId={1}
          />,
        )
        mockTrackRect()
        const handle = document.getElementById('history-timeline-handle')!
        fireEvent.pointerDown(handle, { clientX: pixelForId(items, 1), pointerId: 1 })
        fireEvent.pointerMove(handle, { clientX: pixelForId(items, 2), pointerId: 1 })
        fireEvent.pointerUp(handle, { clientX: pixelForId(items, 2), pointerId: 1 })
        expect(onSelect).toHaveBeenCalledTimes(1)
        expect(onSelect).toHaveBeenCalledWith(2)
      })

      it('sem nenhum pointermove entre down e up (clique rápido na alça), ainda assim seleciona a posição do down', () => {
        const onSelect = vi.fn()
        const items = [
          item(1, '2026-07-05T05:00:00Z', 'continua'),
          item(2, '2026-07-05T18:00:00Z', 'movimento'),
        ]
        render(
          <HistoryTimeline
            recordingItems={items}
            onSelect={onSelect}
            cameraId="cam1"
            selectedId={2}
          />,
        )
        mockTrackRect()
        const handle = document.getElementById('history-timeline-handle')!
        fireEvent.pointerDown(handle, { clientX: pixelForId(items, 1), pointerId: 1 })
        fireEvent.pointerUp(handle, { clientX: pixelForId(items, 1), pointerId: 1 })
        expect(onSelect).toHaveBeenCalledTimes(1)
        expect(onSelect).toHaveBeenCalledWith(1)
      })
    })

    describe('CA5/CA3: a alça sempre gruda numa linha, nunca fica solta num ponto livre', () => {
      it('soltar dentro da MESMA gravação (mesmo id resolvido) sempre volta a alça pro início dela — as linhas são os únicos pontos onde ela gruda', () => {
        // A linha da gravação 1 é o único ponto de "grude" nesta hora (só ela existe) —
        // soltar num pixel um pouco deslocado da posição exata dela ainda resolve pro MESMO
        // id (1, a única linha ali), então onSelect(1) não muda o selectedId. MESMO ASSIM, a
        // alça deve voltar pra posição RENDERIZADA da gravação (não ficar solta no pixel
        // exato onde foi solta) — comportamento intencional: as linhas verticais são os
        // ÚNICOS pontos onde o ponteiro pode "grudar".
        const onSelect = vi.fn()
        const items = [item(1, '2026-07-05T05:00:00Z', 'continua')]
        render(
          <HistoryTimeline
            recordingItems={items}
            onSelect={onSelect}
            cameraId="cam1"
            selectedId={1}
          />,
        )
        mockTrackRect()
        const handle = document.getElementById('history-timeline-handle')!
        const px1 = pixelForId(items, 1)
        fireEvent.pointerDown(handle, { clientX: px1, pointerId: 1 })
        fireEvent.pointerMove(handle, { clientX: px1 + 3, pointerId: 1 })
        fireEvent.pointerUp(handle, { clientX: px1 + 3, pointerId: 1 })
        expect(onSelect).toHaveBeenCalledWith(1)
        expect(parseFloat(handle.style.left)).toBeCloseTo(px1, 5)
      })

      it('clicar dentro do card mas não exatamente na linha também gruda na linha renderizada mais próxima, nunca num ponto livre', () => {
        const onSelect = vi.fn()
        const items = [
          item(1, '2026-07-05T05:00:00Z', 'continua'),
          item(2, '2026-07-05T18:00:00Z', 'movimento'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
        mockTrackRect()
        const px1 = pixelForId(items, 1)
        // Um ponto a 5px da linha 1, ainda dentro do card dela (largura do card > 5px) — gruda
        // na 1, não fica livre no meio do card.
        fireEvent.click(document.getElementById('history-timeline-track')!, { clientX: px1 + 5 })
        expect(onSelect).toHaveBeenCalledWith(1)
        const handle = document.getElementById('history-timeline-handle')!
        expect(parseFloat(handle.style.left)).toBeCloseTo(px1, 5)
      })
    })

    it('sem selectedId e sem arraste em andamento, a alça não aparece', () => {
      const items = [item(1, '2026-07-05T05:00:00Z', 'continua')]
      render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
      expect(document.getElementById('history-timeline-handle')).toBeNull()
    })

    describe('CA4: a alça desce um pouco pra fora da caixa da trilha, sem encolher a seta', () => {
      it('a alça desce um pouco pra fora da caixa da trilha — sem encolher a seta', () => {
        const items = [item(1, '2026-07-05T05:00:00Z', 'continua')]
        render(
          <HistoryTimeline
            recordingItems={items}
            onSelect={vi.fn()}
            cameraId="cam1"
            selectedId={1}
          />,
        )
        // A seta continua tão larga/alta quanto antes (largura pedida pelo navigator,
        // preservada) — a correção da sobreposição não pode encolhê-la.
        const arrow = document.querySelector('#history-timeline-handle span:last-child')!
        expect(arrow.className).toContain('border-x-8')
        expect(arrow.className).toContain('border-t-8')
        // A alça desce (`bottom` negativo) pra fora da caixa da trilha, não fica só encostada
        // na borda (`bottom-0`) — os cabeçalhos de hora ficam ACIMA da trilha agora (não mais
        // uma linha de números embaixo), então essa folga não corre risco de cobrir nada.
        const handle = document.getElementById('history-timeline-handle')!
        expect(handle.className).toContain('-bottom-2')
      })
    })
  })

  describe('Linhas verticais por gravação (posição por índice)', () => {
    describe('CA2: cada linha é posicionada por índice cronológico, com espaçamento sempre uniforme', () => {
      it('cada bloco de hora renderiza uma linha vertical por gravação, posicionada por ÍNDICE cronológico (não pelo horário real) — espaçamento sempre uniforme', () => {
        // Pedido do navigator: a primeira e a última linha de TODO card devem sempre encostar
        // na mesma distância da borda (o padding), e o espaçamento entre linhas vizinhas nunca
        // deve variar de forma estranha — como a LARGURA do card já é só por CONTAGEM (não por
        // duração real coberta pelas gravações), a posição de cada linha também é só por
        // ÍNDICE: mais cedo → 0%, mais tarde → 100%, as do meio em passos IGUAIS entre elas —
        // não proporcional ao tempo real decorrido (07:15 fica a 50%, não a 1/3 do intervalo
        // 07:00↔07:45, mesmo estando temporalmente mais perto do início).
        const items = [
          item(1, '2026-07-05T07:00:00Z', 'continua'),
          item(2, '2026-07-05T07:15:00Z', 'continua'),
          item(3, '2026-07-05T07:45:00Z', 'continua'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        const line1 = document.getElementById('history-timeline-hour-7-rec-1')!
        const line2 = document.getElementById('history-timeline-hour-7-rec-2')!
        const line3 = document.getElementById('history-timeline-hour-7-rec-3')!
        expect(line1.style.left).toBe('0%')
        expect(line2.style.left).toBe('50%')
        expect(line3.style.left).toBe('100%')
      })

      it('uma hora com só 1 gravação ancora a linha em 0% (sem intervalo pra distribuir)', () => {
        const items = [item(1, '2026-07-05T07:37:00Z', 'continua')]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        expect(document.getElementById('history-timeline-hour-7-rec-1')!.style.left).toBe('0%')
      })

      it('hora com N gravações renderiza N linhas — quantidade acompanha a quantidade real de gravações', () => {
        const items = [
          item(1, '2026-07-05T07:00:00Z', 'continua'),
          item(2, '2026-07-05T07:10:00Z', 'continua'),
          item(3, '2026-07-05T07:20:00Z', 'continua'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        const hour7 = document.getElementById('history-timeline-hour-7')!
        expect(hour7.querySelectorAll('span').length).toBe(3)
      })

      it('gravações muito próximas no tempo (reconexões rápidas do gravador) continuam em posições DISTINTAS e uniformemente espaçadas, não colapsam no mesmo pixel', () => {
        // Bug relatado originalmente: 4 gravações numa hora mostrando só 2 linhas (algumas
        // colidindo). Como a posição de cada linha é por ÍNDICE (não pelo horário real), 4
        // gravações a poucos segundos uma da outra ficam tão bem distribuídas quanto 4
        // gravações espalhadas pela hora inteira — 0%, 33.33%, 66.67%, 100%.
        const items = [
          item(1, '2026-07-05T00:00:00Z', 'continua'),
          item(2, '2026-07-05T00:00:05Z', 'continua'),
          item(3, '2026-07-05T00:00:10Z', 'continua'),
          item(4, '2026-07-05T00:00:15Z', 'continua'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        const hour0 = document.getElementById('history-timeline-hour-0')!
        expect(hour0.querySelectorAll('span').length).toBe(4)
        const lefts = [1, 2, 3, 4].map((id) =>
          parseFloat(document.getElementById(`history-timeline-hour-0-rec-${id}`)!.style.left),
        )
        expect(lefts[0]).toBeCloseTo(0, 5)
        expect(lefts[1]).toBeCloseTo(100 / 3, 5)
        expect(lefts[2]).toBeCloseTo(200 / 3, 5)
        expect(lefts[3]).toBeCloseTo(100, 5)
      })

      it('numa hora com POUCAS gravações (card pequeno, sem piso mínimo — só o necessário pra conter as linhas), o espaçamento por índice ainda distribui corretamente', () => {
        // Sem piso mínimo (pedido do navigator: um card já fechado não reserva espaço além
        // do necessário), o card de 2 gravações fica com exatamente 2×5 + 1×2.5 + 24 = 36.5px
        // — com só 2 gravações, a 1ª sempre em 0% e a 2ª sempre em 100% (índice, não tempo).
        const items = [
          item(1, '2026-07-05T00:00:00Z', 'continua'),
          item(2, '2026-07-05T00:00:01Z', 'continua'), // 1s de diferença — irrelevante pra posição
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        const expectedWidth = hourBoxWidthPx(2, LINE_WIDTH_PX, LINE_GAP_PX, CARD_PADDING_PX, 0)
        expect(document.getElementById('history-timeline-hour-0')!.style.width).toBe(
          `${expectedWidth}px`,
        )

        const left1 = document.getElementById('history-timeline-hour-0-rec-1')!.style.left
        const left2 = document.getElementById('history-timeline-hour-0-rec-2')!.style.left
        expect(left1).toBe('0%')
        expect(left2).toBe('100%')
      })

      it('numa hora com MUITAS gravações, o espaçamento por índice continua uniforme — cada linha vizinha à mesma distância relativa', () => {
        // Complementa o teste acima: confirma que o card cresce de verdade com a contagem
        // (largura proporcional, sem piso fixo compartilhado por todas as horas) e que o
        // espaçamento por índice permanece exatamente uniforme mesmo com muitas linhas.
        const items = Array.from({ length: 50 }, (_, i) =>
          item(i + 1, `2026-07-05T00:00:${String(i % 60).padStart(2, '0')}Z`, 'continua'),
        )
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        const hourWidthPx = parseFloat(
          document.getElementById('history-timeline-hour-0')!.style.width,
        )
        const smallCardWidth = hourBoxWidthPx(2, LINE_WIDTH_PX, LINE_GAP_PX, CARD_PADDING_PX, 0)
        expect(hourWidthPx).toBeGreaterThan(smallCardWidth) // 50 linhas exigem bem mais espaço que 2

        const left2 = document.getElementById('history-timeline-hour-0-rec-2')!.style.left
        expect(parseFloat(left2)).toBeCloseTo(100 / 49, 5) // item 2 de 50 → índice 1/49
      })

      it('linhas espaçadas por índice nunca se sobrepõem em PIXELS reais — mede a distância renderizada, não confia numa fórmula interna', () => {
        // Regressão: uma versão anterior calculava a posição por fração de horário real com um
        // "empurrão" de separação mínima, cuja fórmula podia ficar inconsistente com o wrapper
        // recuado (bug real, já corrigido) — o modelo atual (por ÍNDICE) elimina essa classe de
        // bug por construção: o espaçamento entre vizinhas é SEMPRE `contentWidthPx / (N-1)`,
        // que por sua vez é sempre >= o PASSO mínimo (`LINE_WIDTH_PX + LINE_GAP_PX`) usado pra
        // dimensionar o card (`hourBoxWidthPx`). Este teste mede a distância final em PIXELS
        // (via largura real do wrapper), não uma fórmula replicada.
        for (const count of [2, 3, 4, 6]) {
          cleanup()
          const items = Array.from({ length: count }, (_, i) =>
            item(i + 1, `2026-07-05T00:00:0${i}Z`, 'continua'),
          )
          render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
          const widthPx = parseFloat(
            document.getElementById('history-timeline-hour-0')!.style.width,
          )
          const contentWidthPx = widthPx - CARD_PADDING_PX
          const pixelPositions = items
            .map((it) =>
              parseFloat(
                document.getElementById(`history-timeline-hour-0-rec-${it.rec.id}`)!.style.left,
              ),
            )
            .map((pct) => (pct / 100) * contentWidthPx)
            .sort((a, b) => a - b)
          for (let i = 1; i < pixelPositions.length; i++) {
            expect(pixelPositions[i] - pixelPositions[i - 1]).toBeGreaterThanOrEqual(
              LINE_WIDTH_PX + LINE_GAP_PX - 1e-6,
            )
          }
        }
      })
    })
  })

  describe('Cor das linhas por categoria', () => {
    describe('CA2: cada linha usa a cor da própria categoria; o card de fundo continua neutro', () => {
      it('cada linha usa a cor da PRÓPRIA categoria — o card de fundo é sempre neutro, não mais colorido pela categoria dominante', () => {
        const items = [
          item(1, '2026-07-05T18:00:00Z', 'continua'),
          item(2, '2026-07-05T18:10:00Z', 'pessoa'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        expect(document.getElementById('history-timeline-hour-18')!.className).toContain(
          'bg-surface-2',
        )
        expect(document.getElementById('history-timeline-hour-18')!.className).not.toContain(
          'bg-red-500',
        )
        expect(document.getElementById('history-timeline-hour-18-rec-1')!.className).toContain(
          'bg-blue-500', // continua
        )
        expect(document.getElementById('history-timeline-hour-18-rec-2')!.className).toContain(
          'bg-red-500', // pessoa
        )
      })

      it('altura 75% e cantos arredondados nas linhas, medidas do protótipo de referência', () => {
        const items = [item(1, '2026-07-05T18:00:00Z', 'continua')]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        const line = document.getElementById('history-timeline-hour-18-rec-1')!
        expect(line.style.height).toBe('75%')
        expect(line.className).toContain('rounded-[1px]')
      })
    })
  })

  describe('Filtro por categoria oculta linhas/blocos', () => {
    describe('CA3: gravações fora do filtro ativo são removidas da régua', () => {
      it('gravações fora do filtro ativo são REMOVIDAS da régua (a linha não é renderizada)', () => {
        const items = [
          item(1, '2026-07-05T18:00:00Z', 'continua'),
          item(2, '2026-07-05T18:10:00Z', 'pessoa'),
        ]
        render(
          <HistoryTimeline
            recordingItems={items}
            onSelect={vi.fn()}
            cameraId="cam1"
            filter="pessoa"
          />,
        )
        // A linha fora do filtro (item 1, "continua") não existe mais no DOM.
        expect(document.getElementById('history-timeline-hour-18-rec-1')).toBeNull()
        expect(document.getElementById('history-timeline-hour-18-rec-2')).not.toBeNull()
      })

      it('bloco de hora sem NENHUM item correspondente ao filtro some inteiro (não fica vazio)', () => {
        const items = [
          item(1, '2026-07-05T18:00:00Z', 'continua'),
          item(2, '2026-07-05T19:00:00Z', 'pessoa'),
        ]
        render(
          <HistoryTimeline
            recordingItems={items}
            onSelect={vi.fn()}
            cameraId="cam1"
            filter="pessoa"
          />,
        )
        // Hora 18 só tinha "continua" (fora do filtro) — o card da hora inteiro desaparece.
        expect(document.getElementById('history-timeline-hour-18')).toBeNull()
        expect(document.getElementById('history-timeline-hour-19')).not.toBeNull()
        expect(document.getElementById('history-timeline-hour-19-rec-2')).not.toBeNull()
      })

      it('sem a prop `filter`, nenhuma linha é removida (retrocompatível)', () => {
        const items = [
          item(1, '2026-07-05T18:00:00Z', 'continua'),
          item(2, '2026-07-05T18:10:00Z', 'pessoa'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        expect(document.getElementById('history-timeline-hour-18-rec-1')).not.toBeNull()
        expect(document.getElementById('history-timeline-hour-18-rec-2')).not.toBeNull()
        expect(document.getElementById('history-timeline-hour-18-rec-1')!.className).not.toContain(
          'opacity-40',
        )
        expect(document.getElementById('history-timeline-hour-18-rec-2')!.className).not.toContain(
          'opacity-40',
        )
      })
    })
  })

  describe('Scroll horizontal e resolução por geometria real', () => {
    describe('CAscroll: clique e seleção resolvem pela geometria real renderizada, não por uma largura mockada/uniforme', () => {
      it('clique numa régua com uma hora bem mais cheia que as outras mapeia pro card certo — não usa uma largura visível/mockada como divisor', () => {
        // Bug pego no code review original (modelo de largura uniforme): dividir pela largura
        // VISÍVEL/mockada em vez da largura REAL do conteúdo mapeava o clique pro instante
        // errado. Aqui adaptado ao modelo proporcional/compacto: a hora 0 (60 gravações) fica
        // bem mais larga que a hora 20 (1 gravação, piso mínimo) — um clique calculado pela
        // geometria REAL (via `pixelForId`) precisa continuar resolvendo pra dentro da hora 0.
        const onSelect = vi.fn()
        const busyHour = Array.from({ length: 60 }, (_, i) =>
          item(i + 1, `2026-07-05T00:${String(i % 60).padStart(2, '0')}:00Z`, 'continua'),
        )
        const items = [...busyHour, item(999, '2026-07-05T20:00:00Z', 'pessoa')]
        render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
        mockTrackRect()
        fireEvent.click(document.getElementById('history-timeline-track')!, {
          clientX: pixelForId(items, 59),
        })
        expect(onSelect).toHaveBeenCalledWith(59)
      })

      it('o container `#history-timeline-scroll` existe e permite rolagem horizontal', () => {
        const items = [item(1, '2026-07-05T07:00:00Z', 'continua')]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        const scroll = document.getElementById('history-timeline-scroll')!
        expect(scroll.className).toContain('overflow-x-auto')
        expect(scroll.contains(document.getElementById('history-timeline-track'))).toBe(true)
        expect(scroll.contains(document.getElementById('history-timeline-headers'))).toBe(true)
      })

      it('selecionar uma gravação (ex.: clique na lista lateral, fora do próprio timeline) rola a régua até a linha correspondente entrar em vista', () => {
        // Mesmo padrão de `activeCardRef`/`scrollIntoView` em HistoryPage.tsx (lista lateral) —
        // pedido do navigator: clicar numa gravação na lista deve trazer a posição
        // correspondente na régua horizontal pra dentro da área visível.
        const scrollIntoView = vi.fn()
        const original = Element.prototype.scrollIntoView
        Element.prototype.scrollIntoView = scrollIntoView
        try {
          const items = [
            item(1, '2026-07-05T05:00:00Z', 'continua'),
            item(2, '2026-07-05T18:00:00Z', 'movimento'),
          ]
          const { rerender } = render(
            <HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />,
          )
          expect(scrollIntoView).not.toHaveBeenCalled()
          rerender(
            <HistoryTimeline
              recordingItems={items}
              onSelect={vi.fn()}
              cameraId="cam1"
              selectedId={2}
            />,
          )
          expect(scrollIntoView).toHaveBeenCalledWith(
            expect.objectContaining({ inline: 'nearest', block: 'nearest' }),
          )
        } finally {
          Element.prototype.scrollIntoView = original
        }
      })
    })
  })

  describe('Cards discretos por hora', () => {
    describe('CA2: cada hora vira um card discreto, com gap real, cantos arredondados e largura proporcional à quantidade de gravações', () => {
      it('cada hora vira um card discreto — gap real (não mais 1px) entre eles, cantos arredondados', () => {
        const items = [
          item(1, '2026-07-05T00:00:00Z', 'continua'),
          item(2, '2026-07-05T12:00:00Z', 'continua'),
          item(3, '2026-07-05T23:00:00Z', 'continua'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        const track = document.getElementById('history-timeline-track')!
        expect(track.style.gap).toBe('18px')
        expect(document.getElementById('history-timeline-hour-0')!.className).toContain('rounded')
        expect(document.getElementById('history-timeline-hour-12')!.className).toContain('rounded')
        expect(document.getElementById('history-timeline-hour-23')!.className).toContain('rounded')
      })

      it('o cursor "mãozinha" (pointer) só aparece sobre uma LINHA — nem a trilha (gaps entre cards) nem o resto do card (área vazia/padding) usam pointer', () => {
        // `role="button"` na trilha faz o preflight do Tailwind aplicar `cursor: pointer`
        // globalmente nela, mesmo sem a classe utilitária — precisa de um `cursor-default`
        // explícito pra não vazar pros gaps entre cards (bug relatado pelo navigator). O card
        // em si também fica com o cursor padrão (pedido do navigator: a mãozinha só deve
        // responder em cima de uma gravação de verdade, não em qualquer ponto do card) — só a
        // LINHA (`<span>` de cada gravação) leva `cursor-pointer`.
        const items = [item(1, '2026-07-05T07:00:00Z', 'continua')]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        expect(document.getElementById('history-timeline-track')!.className).toContain(
          'cursor-default',
        )
        expect(document.getElementById('history-timeline-hour-7')!.className).not.toContain(
          'cursor-pointer',
        )
        expect(document.getElementById('history-timeline-hour-7-rec-1')!.className).toContain(
          'cursor-pointer',
        )
      })

      it('a largura de cada card é PROPORCIONAL à quantidade de gravações daquela hora — sem piso mínimo, um card já fechado não reserva espaço além do necessário', () => {
        // Hora 7 com 1 gravação só (5+0+24=29px); hora 18 com 20 gravações (bem mais larga) —
        // medidas do protótipo de referência (TimelineHour.tsx, descartado como código),
        // escaladas a pedido do navigator: LINE_WIDTH_PX=5, LINE_GAP_PX=2.5, padding 24.
        const busyHour = Array.from({ length: 20 }, (_, i) =>
          item(i + 1, `2026-07-05T18:${String(i % 60).padStart(2, '0')}:00Z`, 'continua'),
        )
        const items = [item(999, '2026-07-05T07:00:00Z', 'pessoa'), ...busyHour]
        render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
        // 1×5 + 0×2.5 + 24 = 29px.
        expect(document.getElementById('history-timeline-hour-7')!.style.width).toBe('29px')
        // 20×5 + 19×2.5 + 24 = 100+47.5+24 = 171.5px.
        expect(document.getElementById('history-timeline-hour-18')!.style.width).toBe('171.5px')
      })
    })
  })

  describe('Interação com larguras/gaps reais (handle e clique)', () => {
    describe('CA3: alça e clique consideram as larguras proporcionais e os gaps reais entre os cards de hora', () => {
      it('a alça posiciona corretamente considerando as larguras PROPORCIONAIS e os gaps reais entre os cards de hora renderizados', () => {
        const busyHour = Array.from({ length: 60 }, (_, i) =>
          item(i + 1, `2026-07-05T00:${String(i % 60).padStart(2, '0')}:00Z`, 'continua'),
        )
        render(
          <HistoryTimeline
            recordingItems={busyHour}
            onSelect={vi.fn()}
            cameraId="cam1"
            selectedId={30}
          />,
        )
        const handle = document.getElementById('history-timeline-handle')!
        expect(handle.style.left.endsWith('px')).toBe(true)
        expect(parseFloat(handle.style.left)).toBeCloseTo(pixelForId(busyHour, 30), 5)
      })

      it('clique na trilha continua selecionando a gravação certa considerando o gap real entre cards', () => {
        const onSelect = vi.fn()
        const items = [
          item(2, '2026-07-05T18:20:00Z', 'pessoa'),
          item(1, '2026-07-05T18:03:00Z', 'movimento'),
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
        mockTrackRect()
        fireEvent.click(document.getElementById('history-timeline-track')!, {
          clientX: pixelForId(items, 1),
        })
        expect(onSelect).toHaveBeenCalledWith(1)
      })

      it('clicar exatamente na posição RENDERIZADA de uma linha espaçada por índice seleciona a gravação DAQUELA linha, não a vizinha por horário bruto', () => {
        // Regressão do bug relatado pelo navigator (print em work_progress/amostras/): numa
        // hora com gravações muito próximas no tempo, a linha "empurrada" pelo espalhamento
        // mínimo ficava inclicável — clicar nela sempre selecionava a vizinha "âncora" (a
        // resolução antiga convertia pixel→horário bruto e achava a gravação mais próxima por
        // HORÁRIO, ignorando o deslocamento visual). No modelo atual (posição por ÍNDICE, não
        // por horário), duas gravações a 11s uma da outra na mesma hora ficam tão bem
        // separadas quanto qualquer outro par (0% e 100%, únicas 2 da hora) — clicar
        // exatamente na posição renderizada da linha 4 precisa resolver pra 4, não pra 3.
        const onSelect = vi.fn()
        const items = [
          item(3, '2026-07-05T21:36:18Z', 'pessoa'),
          item(4, '2026-07-05T21:36:29Z', 'movimento'), // 11s depois — só a ordem importa, não a distância real
        ]
        render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
        mockTrackRect()
        // Clica exatamente na posição renderizada da linha 4 (a "empurrada" do par).
        fireEvent.click(document.getElementById('history-timeline-track')!, {
          clientX: pixelForId(items, 4),
        })
        expect(onSelect).toHaveBeenCalledWith(4)
      })
    })
  })
})
