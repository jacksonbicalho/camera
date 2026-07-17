import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, fireEvent } from '@testing-library/react'
import HistoryTimeline from './HistoryTimeline'
import type { Recording } from '../pages/cameraUtils'
import type { RecordingCategory } from '../pages/eventCategory'
import { computeHourLayout, hourBoxWidthPx, timeFractionToPixel } from './timelineScale'

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

const DAY_MS = 24 * 3600_000
const DAY_START = Date.parse('2026-07-05T00:00:00Z')

// Mesmas medidas do componente (HistoryTimeline.tsx) — duplicadas aqui (não importadas)
// porque são detalhe de implementação privado do componente; os testes só conhecem o
// contrato público (`hourBoxWidthPx`/`computeHourLayout`/`timeFractionToPixel`, funções
// puras de timelineScale.ts) + estas medidas, mesmo padrão de outros testes do arquivo.
const LINE_WIDTH_PX = 3
const LINE_GAP_PX = 1.5
const CARD_GAP_PX = 12
const CARD_PADDING_PX = 16
const MIN_HOUR_WIDTH_PX = 80

// hourWidthsFor computa a largura (px) de cada uma das 24 horas a partir da lista de itens
// de teste — MESMA fórmula usada pelo componente (`hourBoxWidthPx`, timelineScale.ts): cada
// card é proporcional à contagem de gravações daquela hora, não mais uma largura uniforme
// fixa. Usado pra prever a posição em pixel esperada nos testes de clique/arraste, sem
// duplicar a lógica com números mágicos.
function hourWidthsFor(items: { rec: { start: string } }[]): number[] {
  const counts = new Array(24).fill(0) as number[]
  for (const it of items) {
    counts[new Date(it.rec.start).getHours()]++
  }
  return counts.map((c) =>
    hourBoxWidthPx(c, LINE_WIDTH_PX, LINE_GAP_PX, CARD_PADDING_PX, MIN_HOUR_WIDTH_PX),
  )
}

// clientXFor calcula o clientX (relativo à trilha, `left: 0` mockado por `mockTrackRect`)
// correspondente a um horário ISO — usa a MESMA geometria proporcional que o componente
// usa de verdade (largura de cada hora depende de `items`), não uma largura fixa
// arbitrária.
function clientXFor(items: { rec: { start: string } }[], iso: string): number {
  const widths = hourWidthsFor(items)
  const layout = computeHourLayout(widths, CARD_GAP_PX)
  const fraction = (Date.parse(iso) - DAY_START) / DAY_MS
  return timeFractionToPixel(fraction, widths, layout)
}

// mockTrackRect dá um retângulo determinístico à trilha — jsdom não faz layout de
// verdade, então getBoundingClientRect() sempre devolve zeros sem isso. A largura em si
// não importa mais pro cálculo de posição (que hoje vem só de `items`, determinístico) —
// só precisa ser > 0 pra passar o guard de "elemento ainda não renderizado" e ter
// `left: 0` pra não deslocar as contas de `clientXFor`.
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
  it('CA2: renderiza um bloco por hora colorido pela categoria dominante e o resumo com o total', () => {
    const items = [
      item(1, '2026-07-05T07:12:00Z', 'continua'),
      item(2, '2026-07-05T18:03:00Z', 'movimento'),
      item(3, '2026-07-05T18:20:00Z', 'pessoa'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)

    // Hora 7 (só continua) → cor de continua; hora 18 (movimento + pessoa) → prioridade
    // pessoa vence.
    const hour7 = document.getElementById('history-timeline-hour-7')!
    const hour18 = document.getElementById('history-timeline-hour-18')!
    expect(hour7.className).toContain('bg-blue-500')
    expect(hour18.className).toContain('bg-red-500')

    const summary = document.getElementById('history-timeline-summary')!
    expect(summary.textContent).toContain('3')
  })

  it('CA2: hora sem nenhuma gravação renderiza um bloco neutro', () => {
    const items = [item(1, '2026-07-05T07:12:00Z', 'continua')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    const hour0 = document.getElementById('history-timeline-hour-0')!
    expect(hour0.className).toContain('bg-surface-2')
  })

  it('CA2: sem nenhuma gravação, não renderiza nada', () => {
    const { container } = render(
      <HistoryTimeline recordingItems={[]} onSelect={vi.fn()} cameraId="cam1" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('CA2: com `day` explícito, filtro sem NENHUMA gravação correspondente ainda renderiza a régua inteira (24 blocos neutros) — não desaparece', () => {
    // Diferente do teste acima: ali não há `day` (não dá pra saber que dia é sem nenhum
    // item), então some de propósito. Aqui o dia É conhecido (ex.: HistoryPage sempre tem
    // `selectedDate`) — um filtro que zera a lista não deve fazer a régua sumir, só as
    // horas ficarem neutras (mesmo espírito de "hora sem gravação" já existente).
    render(
      <HistoryTimeline
        recordingItems={[]}
        onSelect={vi.fn()}
        cameraId="cam1"
        day={new Date('2026-07-05T12:00:00Z')}
      />,
    )
    expect(document.getElementById('history-timeline-track')).not.toBeNull()
    expect(document.getElementById('history-timeline-hour-0')!.className).toContain('bg-surface-2')
    expect(document.getElementById('history-timeline-hour-23')!.className).toContain('bg-surface-2')
    expect(document.getElementById('history-timeline-summary')!.textContent).toBe('0 gravações')
  })

  it('CA3: clique na trilha seleciona a gravação mais próxima daquele instante', () => {
    const onSelect = vi.fn()
    const items = [
      item(2, '2026-07-05T18:20:00Z', 'pessoa'),
      item(1, '2026-07-05T18:03:00Z', 'movimento'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
    mockTrackRect()
    fireEvent.click(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor(items, '2026-07-05T18:03:00Z'),
    })
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('CA4header: cada card ganha um cabeçalho próprio com a hora e a contagem de gravações daquela hora', () => {
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
    // Hora sem nenhuma gravação ainda ganha cabeçalho, com contagem 0.
    expect(document.getElementById('history-timeline-hour-0-header')!.textContent).toBe(
      '0h · 0 gravações',
    )
  })

  it('CA4header: os 24 cabeçalhos de hora aparecem, um por hora do dia (0 a 23)', () => {
    const items = [item(1, '2026-07-05T07:12:00Z', 'continua')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    for (let h = 0; h < 24; h++) {
      expect(document.getElementById(`history-timeline-hour-${h}-header`)).not.toBeNull()
    }
  })

  it('CA4header: os cabeçalhos usam o MESMO gap/largura por coluna da trilha abaixo — sem isso desalinhariam sob o card correspondente', () => {
    const items = [
      item(1, '2026-07-05T07:12:00Z', 'continua'),
      item(2, '2026-07-05T18:00:00Z', 'movimento'),
      item(3, '2026-07-05T18:05:00Z', 'movimento'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    expect(document.getElementById('history-timeline-headers')!.style.gap).toBe('12px')
    // Hora 18 (2 gravações, card mais largo que o mínimo) — cabeçalho e card de baixo
    // continuam com a MESMA largura entre si.
    expect(document.getElementById('history-timeline-hour-18-header')!.style.width).toBe(
      document.getElementById('history-timeline-hour-18')!.style.width,
    )
  })

  it('CA4: mover o mouse sobre a trilha mostra um preview com miniatura e o horário, sem exigir clique', () => {
    vi.useFakeTimers()
    const items = [item(1, '2026-07-05T18:03:00Z', 'movimento')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    mockTrackRect()

    expect(document.getElementById('history-timeline-preview')).toBeNull()

    fireEvent.mouseMove(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor(items, '2026-07-05T18:03:00Z'),
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

  it('CA4: numa lacuna sem nenhuma gravação (hora sem vídeo), o preview NÃO aparece', () => {
    vi.useFakeTimers()
    // Só há gravação às 07h — 18h é uma lacuna franca (sem cobertura nenhuma).
    const items = [item(1, '2026-07-05T07:00:00Z', 'continua')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    mockTrackRect()
    fireEvent.mouseMove(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor(items, '2026-07-05T18:00:00Z'),
    })
    act(() => vi.advanceTimersByTime(200))
    expect(document.getElementById('history-timeline-preview')).toBeNull()
  })

  it('CA4: mousemove contínuo reinicia o debounce — não busca uma imagem por posição intermediária', () => {
    vi.useFakeTimers()
    const onFrameRequests: string[] = []
    const items = [item(1, '2026-07-05T18:03:00Z', 'movimento')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    mockTrackRect()
    const track = document.getElementById('history-timeline-track')!

    // Move o mouse por várias posições intermediárias em rápida sucessão (< debounce entre
    // cada uma) — só a ÚLTIMA posição deve gerar preview, nunca as intermediárias.
    for (const t of ['12:00:00Z', '13:00:00Z', '14:00:00Z', '18:03:00Z']) {
      fireEvent.mouseMove(track, { clientX: clientXFor(items, `2026-07-05T${t}`) })
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

  it('CA4: sair do hover (mouseleave) esconde o preview', () => {
    vi.useFakeTimers()
    const items = [item(1, '2026-07-05T18:03:00Z', 'movimento')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    mockTrackRect()
    const track = document.getElementById('history-timeline-track')!
    fireEvent.mouseMove(track, { clientX: clientXFor(items, '2026-07-05T18:03:00Z') })
    act(() => vi.advanceTimersByTime(200))
    expect(document.getElementById('history-timeline-preview')).not.toBeNull()
    fireEvent.mouseLeave(track)
    expect(document.getElementById('history-timeline-preview')).toBeNull()
  })

  it('CA4: imagem de preview que falha mostra "sem prévia" em vez de manter a miniatura quebrada', () => {
    vi.useFakeTimers()
    const items = [item(1, '2026-07-05T18:03:00Z', 'movimento')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    mockTrackRect()
    const track = document.getElementById('history-timeline-track')!
    fireEvent.mouseMove(track, { clientX: clientXFor(items, '2026-07-05T18:03:00Z') })
    act(() => vi.advanceTimersByTime(200))
    const img = document.querySelector('#history-timeline-preview img')!
    fireEvent.error(img)
    expect(document.getElementById('history-timeline-preview')!.textContent).toContain('sem prévia')
  })

  it('CA5: clique perto de outro instante seleciona uma gravação diferente da mais próxima anterior — não é sempre a primeira da hora', () => {
    const onSelect = vi.fn()
    const items = [
      item(2, '2026-07-05T18:20:00Z', 'pessoa'),
      item(1, '2026-07-05T18:03:00Z', 'movimento'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
    mockTrackRect()
    fireEvent.click(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor(items, '2026-07-05T18:20:00Z'),
    })
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('CA5: clique antes do início da trilha (clientX negativo) clampa pra fração 0, seleciona a gravação mais cedo', () => {
    const onSelect = vi.fn()
    const items = [
      item(2, '2026-07-05T18:00:00Z', 'movimento'),
      item(1, '2026-07-05T05:00:00Z', 'continua'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
    mockTrackRect()
    fireEvent.click(document.getElementById('history-timeline-track')!, { clientX: -500 })
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('CA5: clique depois do fim da trilha (clientX além da largura) clampa pra fração 1, seleciona a gravação mais tarde', () => {
    const onSelect = vi.fn()
    const items = [
      item(2, '2026-07-05T18:00:00Z', 'movimento'),
      item(1, '2026-07-05T05:00:00Z', 'continua'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
    mockTrackRect()
    fireEvent.click(document.getElementById('history-timeline-track')!, { clientX: 999999 })
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('CA4drag: arrastar a alça atualiza a posição/preview, sem chamar onSelect durante o arraste', () => {
    vi.useFakeTimers()
    const onSelect = vi.fn()
    const items = [
      item(1, '2026-07-05T05:00:00Z', 'continua'),
      item(2, '2026-07-05T18:00:00Z', 'movimento'),
    ]
    render(
      <HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" selectedId={1} />,
    )
    mockTrackRect()
    const handle = document.getElementById('history-timeline-handle')!
    fireEvent.pointerDown(handle, {
      clientX: clientXFor(items, '2026-07-05T05:00:00Z'),
      pointerId: 1,
    })
    fireEvent.pointerMove(handle, {
      clientX: clientXFor(items, '2026-07-05T10:00:00Z'),
      pointerId: 1,
    })
    fireEvent.pointerMove(handle, {
      clientX: clientXFor(items, '2026-07-05T18:00:00Z'),
      pointerId: 1,
    })
    // Nenhuma troca de gravação durante o arraste — só ao soltar (CA5drag).
    expect(onSelect).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(200))
    const preview = document.getElementById('history-timeline-preview')
    expect(preview?.textContent).toContain('18:00')
  })

  it('CA5drag: soltar a alça seleciona a gravação mais próxima da posição final, exatamente uma vez', () => {
    const onSelect = vi.fn()
    const items = [
      item(1, '2026-07-05T05:00:00Z', 'continua'),
      item(2, '2026-07-05T18:00:00Z', 'movimento'),
    ]
    render(
      <HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" selectedId={1} />,
    )
    mockTrackRect()
    const handle = document.getElementById('history-timeline-handle')!
    fireEvent.pointerDown(handle, {
      clientX: clientXFor(items, '2026-07-05T05:00:00Z'),
      pointerId: 1,
    })
    fireEvent.pointerMove(handle, {
      clientX: clientXFor(items, '2026-07-05T18:00:00Z'),
      pointerId: 1,
    })
    fireEvent.pointerUp(handle, {
      clientX: clientXFor(items, '2026-07-05T18:00:00Z'),
      pointerId: 1,
    })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it('CA5drag: sem nenhum pointermove entre down e up (clique rápido na alça), ainda assim seleciona a posição do down', () => {
    const onSelect = vi.fn()
    const items = [
      item(1, '2026-07-05T05:00:00Z', 'continua'),
      item(2, '2026-07-05T18:00:00Z', 'movimento'),
    ]
    render(
      <HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" selectedId={2} />,
    )
    mockTrackRect()
    const handle = document.getElementById('history-timeline-handle')!
    fireEvent.pointerDown(handle, {
      clientX: clientXFor(items, '2026-07-05T05:00:00Z'),
      pointerId: 1,
    })
    fireEvent.pointerUp(handle, {
      clientX: clientXFor(items, '2026-07-05T05:00:00Z'),
      pointerId: 1,
    })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('CA5drag/CA3linesnap: soltar dentro da MESMA gravação (mesmo id resolvido) sempre volta a alça pro início dela — as linhas são os únicos pontos onde ela gruda', () => {
    // A cobertura de uma gravação é de CHUNK_FALLBACK_MS (5min) a partir do início — soltar
    // 3min depois do início ainda resolve pro MESMO id (1), então onSelect(1) não muda o
    // selectedId (HistoryPage não re-renderiza com um selectedId novo). MESMO ASSIM, a alça
    // deve voltar pro início da gravação (05:00) — comportamento intencional desta história:
    // as linhas verticais (uma por gravação) são os ÚNICOS pontos onde o ponteiro pode
    // "grudar", nunca um ponto livre/contínuo dentro da gravação (reverte de propósito o
    // comportamento anterior, que mantinha a alça exatamente onde foi solta).
    const onSelect = vi.fn()
    const items = [item(1, '2026-07-05T05:00:00Z', 'continua')]
    render(
      <HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" selectedId={1} />,
    )
    mockTrackRect()
    const handle = document.getElementById('history-timeline-handle')!
    fireEvent.pointerDown(handle, {
      clientX: clientXFor(items, '2026-07-05T05:00:00Z'),
      pointerId: 1,
    })
    fireEvent.pointerMove(handle, {
      clientX: clientXFor(items, '2026-07-05T05:03:00Z'),
      pointerId: 1,
    })
    fireEvent.pointerUp(handle, {
      clientX: clientXFor(items, '2026-07-05T05:03:00Z'),
      pointerId: 1,
    })
    expect(onSelect).toHaveBeenCalledWith(1)
    expect(handle.style.left.endsWith('px')).toBe(true)
    expect(parseFloat(handle.style.left)).toBeCloseTo(clientXFor(items, '2026-07-05T05:00:00Z'), 5)
  })

  it('CA3linesnap: clicar numa lacuna sem gravação nenhuma também gruda no início da gravação real mais próxima, nunca num ponto livre', () => {
    const onSelect = vi.fn()
    const items = [
      item(1, '2026-07-05T05:00:00Z', 'continua'),
      item(2, '2026-07-05T18:00:00Z', 'movimento'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
    mockTrackRect()
    // 10h: mais perto de 05:00 (5h de distância) do que de 18:00 (8h de distância) — gruda
    // no início da gravação 1, nunca na posição livre de 10h.
    fireEvent.click(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor(items, '2026-07-05T10:00:00Z'),
    })
    expect(onSelect).toHaveBeenCalledWith(1)
    const handle = document.getElementById('history-timeline-handle')!
    expect(parseFloat(handle.style.left)).toBeCloseTo(clientXFor(items, '2026-07-05T05:00:00Z'), 5)
  })

  it('CA2vlines: cada bloco de hora renderiza uma linha vertical por gravação, posicionada pela fração real do horário dentro da hora', () => {
    // Hora 7 com 2 gravações: uma no início (07:00, fração 0 dentro da hora) e outra na
    // metade (07:30, fração 0.5) — a posição de cada linha reflete o horário real, não a
    // ordem/índice (uma distribuição uniforme por índice colocaria a 2ª em 100%, não 50%).
    const items = [
      item(1, '2026-07-05T07:00:00Z', 'continua'),
      item(2, '2026-07-05T07:30:00Z', 'continua'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    const line1 = document.getElementById('history-timeline-hour-7-rec-1')!
    const line2 = document.getElementById('history-timeline-hour-7-rec-2')!
    expect(line1.style.left).toBe('0%')
    expect(line2.style.left).toBe('50%')
  })

  it('CA2vlines: hora com N gravações renderiza N linhas — quantidade acompanha a quantidade real de gravações', () => {
    const items = [
      item(1, '2026-07-05T07:00:00Z', 'continua'),
      item(2, '2026-07-05T07:10:00Z', 'continua'),
      item(3, '2026-07-05T07:20:00Z', 'continua'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    const hour7 = document.getElementById('history-timeline-hour-7')!
    expect(hour7.querySelectorAll('span').length).toBe(3)
    // Hora sem nenhuma gravação não renderiza linha nenhuma.
    const hour0 = document.getElementById('history-timeline-hour-0')!
    expect(hour0.querySelectorAll('span').length).toBe(0)
  })

  it('CA2vlines: gravações muito próximas no tempo (reconexões rápidas do gravador) continuam em posições DISTINTAS, não colapsam no mesmo pixel', () => {
    // Bug relatado: 4 gravações numa hora mostrando só 2 linhas (algumas colidindo) — a
    // fração pura, sem espaçamento mínimo, deixaria essas 4 quase idênticas (segundos de
    // diferença numa hora inteira).
    const items = [
      item(1, '2026-07-05T00:00:00Z', 'continua'),
      item(2, '2026-07-05T00:00:05Z', 'continua'),
      item(3, '2026-07-05T00:00:10Z', 'continua'),
      item(4, '2026-07-05T00:00:15Z', 'continua'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    const hour0 = document.getElementById('history-timeline-hour-0')!
    expect(hour0.querySelectorAll('span').length).toBe(4)
    const lefts = [1, 2, 3, 4].map(
      (id) => document.getElementById(`history-timeline-hour-0-rec-${id}`)!.style.left,
    )
    // Todas as 4 posições são distintas entre si.
    expect(new Set(lefts).size).toBe(4)
    // A mais cedo (id 1) mantém a posição proporcional exata (0%) — só as seguintes,
    // muito próximas dela, são empurradas pra garantir a separação mínima.
    expect(lefts[0]).toBe('0%')
  })

  it('CA2vlines: numa hora com largura PEQUENA (perto do piso mínimo, poucas gravações), o mínimo entre linhas ainda é aplicado corretamente', () => {
    // Card com só 2 gravações fica no piso mínimo (80px, `MIN_HOUR_WIDTH_PX`) — mesmo
    // assim, a separação mínima entre as duas linhas (`spreadFractions`) precisa
    // continuar funcionando (proporcionalmente maior nesse card estreito).
    const items = [
      item(1, '2026-07-05T00:00:00Z', 'continua'),
      item(2, '2026-07-05T00:00:01Z', 'continua'), // 1s de diferença — bem menor que o mínimo
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    const widths = hourWidthsFor(items)
    expect(widths[0]).toBe(MIN_HOUR_WIDTH_PX) // 2 linhas: 2×3+1×1.5+16 = 23.5 < 80 (piso vale)

    const left1 = document.getElementById('history-timeline-hour-0-rec-1')!.style.left
    const left2 = document.getElementById('history-timeline-hour-0-rec-2')!.style.left
    expect(left1).toBe('0%')
    // minLineGapFraction = (LINE_WIDTH_PX + LINE_GAP_PX) / larguraDoCard — o mínimo é o
    // PASSO inteiro (largura + margem), não só a margem: `spreadFractions` aplica esse
    // valor entre os CENTROS de linhas vizinhas.
    const minGapFraction = ((LINE_WIDTH_PX + LINE_GAP_PX) / MIN_HOUR_WIDTH_PX) * 100
    expect(parseFloat(left2)).toBeCloseTo(minGapFraction, 5)
  })

  it('CA2vlines: numa hora com largura GRANDE (muitas gravações, card mais largo que o piso), o mínimo entre linhas fica proporcionalmente menor', () => {
    // Complementa o teste acima: confirma que o card cresce de verdade com a contagem — a
    // fração mínima entre linhas fica MENOR (mais espaço disponível), não presa a um piso
    // fixo compartilhado por todas as horas.
    const items = Array.from({ length: 50 }, (_, i) =>
      item(i + 1, `2026-07-05T00:00:${String(i % 60).padStart(2, '0')}Z`, 'continua'),
    )
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    const widths = hourWidthsFor(items)
    const hourWidthPx = widths[0]
    expect(hourWidthPx).toBeGreaterThan(MIN_HOUR_WIDTH_PX) // 50 linhas exigem mais que o piso

    const left2 = document.getElementById('history-timeline-hour-0-rec-2')!.style.left
    const minGapFraction = ((LINE_WIDTH_PX + LINE_GAP_PX) / hourWidthPx) * 100
    expect(parseFloat(left2)).toBeCloseTo(minGapFraction, 5)
  })

  it('CA2semfiltro: a régua sempre mostra TODAS as gravações — a cor do bloco de hora não depende da prop `filter`, só as linhas esmaecem', () => {
    // Hora 18 tem uma gravação "continua" e uma "pessoa" — com o filtro "pessoa" ativo,
    // a cor do bloco continua vindo da prioridade entre AMBAS (pessoa vence, como sem
    // filtro nenhum); só a linha da gravação "continua" (fora do filtro) fica esmaecida.
    const items = [
      item(1, '2026-07-05T18:00:00Z', 'continua'),
      item(2, '2026-07-05T18:10:00Z', 'pessoa'),
    ]
    render(
      <HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" filter="pessoa" />,
    )
    // Cor do bloco: idêntica ao caso sem filtro (CA2 acima) — prioridade entre TODOS.
    expect(document.getElementById('history-timeline-hour-18')!.className).toContain('bg-red-500')
    // Nenhuma gravação foi removida: as duas linhas continuam no DOM.
    expect(document.getElementById('history-timeline-hour-18-rec-1')).not.toBeNull()
    expect(document.getElementById('history-timeline-hour-18-rec-2')).not.toBeNull()
    // Só a linha fora do filtro (item 1, "continua") fica esmaecida.
    expect(document.getElementById('history-timeline-hour-18-rec-1')!.className).toContain(
      'opacity-40',
    )
    expect(document.getElementById('history-timeline-hour-18-rec-2')!.className).not.toContain(
      'opacity-40',
    )
  })

  it('CA2semfiltro: sem a prop `filter`, nenhuma linha fica esmaecida (retrocompatível)', () => {
    const items = [
      item(1, '2026-07-05T18:00:00Z', 'continua'),
      item(2, '2026-07-05T18:10:00Z', 'pessoa'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    expect(document.getElementById('history-timeline-hour-18-rec-1')!.className).not.toContain(
      'opacity-40',
    )
    expect(document.getElementById('history-timeline-hour-18-rec-2')!.className).not.toContain(
      'opacity-40',
    )
  })

  it('CAscroll: clique numa régua com uma hora bem mais cheia que as outras mapeia pro instante certo — não usa uma largura visível/mockada como divisor da fração', () => {
    // Bug pego no code review original (modelo de largura uniforme): dividir pela largura
    // VISÍVEL/mockada em vez da largura REAL do conteúdo mapeava o clique pro instante
    // errado. Aqui adaptado ao modelo proporcional: a hora 0 (60 gravações) fica bem mais
    // larga que a hora 20 (1 gravação, piso mínimo) — um clique calculado pela geometria
    // REAL (via `clientXFor`, que usa a mesma fórmula do componente) precisa continuar
    // resolvendo pra dentro da hora 0, nunca "vazando" pra hora 20.
    const onSelect = vi.fn()
    const busyHour = Array.from({ length: 60 }, (_, i) =>
      item(i + 1, `2026-07-05T00:${String(i % 60).padStart(2, '0')}:00Z`, 'continua'),
    )
    const items = [...busyHour, item(999, '2026-07-05T20:00:00Z', 'pessoa')]
    render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
    mockTrackRect()
    // Um ponto perto do FIM da hora 0 (que agora é BEM mais larga que o piso, por causa das
    // 60 gravações) — precisa resolver pra alguma gravação da hora 0, nunca pra 999 (hora 20).
    fireEvent.click(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor(items, '2026-07-05T00:59:00Z'),
    })
    const selectedId = onSelect.mock.calls[0]![0] as number
    expect(selectedId).not.toBe(999)
    expect(selectedId).toBeGreaterThanOrEqual(1)
    expect(selectedId).toBeLessThanOrEqual(60)
  })

  it('CAscroll: o container `#history-timeline-scroll` existe e permite rolagem horizontal', () => {
    const items = [item(1, '2026-07-05T07:00:00Z', 'continua')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    const scroll = document.getElementById('history-timeline-scroll')!
    expect(scroll.className).toContain('overflow-x-auto')
    expect(scroll.contains(document.getElementById('history-timeline-track'))).toBe(true)
    expect(scroll.contains(document.getElementById('history-timeline-headers'))).toBe(true)
  })

  it('CA3snap: soltar numa lacuna sem gravação nenhuma reposiciona a alça pra gravação REAL selecionada, não fica solta no vazio', () => {
    // item 1 às 05:00 e item 2 às 07:00 (gap de 2h sem cobertura nenhuma, já que
    // CHUNK_FALLBACK_MS é só 5min). Soltar às 06:30 (mais perto do item 2) seleciona o
    // item 2 por proximidade (recordingAtMs), mas 06:30 não é coberto por NENHUM dos
    // dois — a alça deve ir pra posição REAL do item 2 (07:00), não ficar largada em
    // 06:30 (onde não há gravação nenhuma) — bug relatado pelo navigator.
    const onSelect = vi.fn()
    const items = [
      item(2, '2026-07-05T07:00:00Z', 'continua'),
      item(1, '2026-07-05T05:00:00Z', 'continua'),
    ]
    render(
      <HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" selectedId={1} />,
    )
    mockTrackRect()
    const handle = document.getElementById('history-timeline-handle')!
    fireEvent.pointerDown(handle, {
      clientX: clientXFor(items, '2026-07-05T05:00:00Z'),
      pointerId: 1,
    })
    fireEvent.pointerMove(handle, {
      clientX: clientXFor(items, '2026-07-05T06:30:00Z'),
      pointerId: 1,
    })
    fireEvent.pointerUp(handle, {
      clientX: clientXFor(items, '2026-07-05T06:30:00Z'),
      pointerId: 1,
    })
    expect(onSelect).toHaveBeenCalledWith(2)
    expect(parseFloat(handle.style.left)).toBeCloseTo(clientXFor(items, '2026-07-05T07:00:00Z'), 5)
  })

  it('sem selectedId e sem arraste em andamento, a alça não aparece', () => {
    const items = [item(1, '2026-07-05T05:00:00Z', 'continua')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    expect(document.getElementById('history-timeline-handle')).toBeNull()
  })

  it('CA4spacing: a alça desce um pouco pra fora da caixa da trilha — sem encolher a seta', () => {
    const items = [item(1, '2026-07-05T05:00:00Z', 'continua')]
    render(
      <HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" selectedId={1} />,
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

  it('CA2cards: cada hora vira um card discreto — gap real (não mais 1px) entre eles, cantos arredondados em TODOS os cards (não só nas pontas)', () => {
    const items = [item(1, '2026-07-05T07:00:00Z', 'continua')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    const track = document.getElementById('history-timeline-track')!
    expect(track.style.gap).toBe('12px')
    // Hora do meio (nem a primeira nem a última) também é arredondada — antes só as
    // pontas (`rounded-l`/`rounded-r`) ganhavam canto, porque a barra era contínua;
    // como cards discretos, TODA hora lê como uma unidade própria.
    expect(document.getElementById('history-timeline-hour-7')!.className).toContain('rounded')
    expect(document.getElementById('history-timeline-hour-0')!.className).toContain('rounded')
    expect(document.getElementById('history-timeline-hour-23')!.className).toContain('rounded')
  })

  it('CA2cards: a largura de cada card é PROPORCIONAL à quantidade de gravações daquela hora — não mais uma largura uniforme compartilhada por todas as 24 horas', () => {
    // Hora 7 com 1 gravação só (fica no piso mínimo, 80px); hora 18 com 20 gravações
    // (bem mais larga que o piso) — medidas do protótipo de referência (TimelineHour.tsx,
    // descartado como código): LINE_WIDTH_PX=3, LINE_GAP_PX=1.5, padding lateral 16,
    // mínimo 80px.
    const busyHour = Array.from({ length: 20 }, (_, i) =>
      item(i + 1, `2026-07-05T18:${String(i % 60).padStart(2, '0')}:00Z`, 'continua'),
    )
    const items = [item(999, '2026-07-05T07:00:00Z', 'pessoa'), ...busyHour]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    expect(document.getElementById('history-timeline-hour-7')!.style.width).toBe('80px')
    // 20×3 + 19×1.5 + 16 = 60+28.5+16 = 104.5px.
    expect(document.getElementById('history-timeline-hour-18')!.style.width).toBe('104.5px')
    // Hora sem nenhuma gravação também fica no piso mínimo.
    expect(document.getElementById('history-timeline-hour-0')!.style.width).toBe('80px')
  })

  it('CA3interacao: a alça/preview posicionam corretamente considerando as larguras PROPORCIONAIS e os gaps reais entre os 24 cards de hora', () => {
    // Card de largura variável por hora (proporcional à contagem) torna a relação entre
    // "fração do dia" e "posição em pixel" NÃO-LINEAR — uma conta simples de
    // `fração × larguraTotal` desalinharia a alça com os cards de verdade sempre que as
    // larguras divergissem entre si (ver `timeFractionToPixel`, timelineScale.ts). Esta
    // suíte usa a MESMA fórmula (via `clientXFor`, que chama as funções de produção) pra
    // prever a posição esperada — não um número mágico.
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
    expect(parseFloat(handle.style.left)).toBeCloseTo(
      clientXFor(busyHour, '2026-07-05T00:29:00Z'),
      2,
    )
  })

  it('CA3interacao: clique na trilha continua selecionando a gravação certa considerando o gap real entre cards', () => {
    const onSelect = vi.fn()
    const items = [
      item(2, '2026-07-05T18:20:00Z', 'pessoa'),
      item(1, '2026-07-05T18:03:00Z', 'movimento'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
    mockTrackRect()
    fireEvent.click(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor(items, '2026-07-05T18:03:00Z'),
    })
    expect(onSelect).toHaveBeenCalledWith(1)
  })
})
