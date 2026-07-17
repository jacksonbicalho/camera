import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, fireEvent } from '@testing-library/react'
import HistoryTimeline from './HistoryTimeline'
import type { Recording } from '../pages/cameraUtils'
import type { RecordingCategory } from '../pages/eventCategory'

vi.mock('../auth', () => ({ getToken: () => 'fake-token' }))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
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

// clientXFor calcula o clientX correspondente a um horário ISO, assumindo a trilha
// mockada com `left: 0` e a largura dada — mesma janela (dia inteiro, TZ=UTC no ambiente
// de teste) que o componente usa internamente.
function clientXFor(iso: string, trackWidth: number): number {
  const fraction = (Date.parse(iso) - DAY_START) / DAY_MS
  return fraction * trackWidth
}

// mockTrackRect dá um retângulo determinístico à trilha — jsdom não faz layout de
// verdade, então getBoundingClientRect() sempre devolve zeros sem isso.
function mockTrackRect(width: number) {
  const track = document.getElementById('history-timeline-track')!
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width,
    top: 0,
    right: width,
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
  it('CA2: renderiza um bloco por hora colorido pela categoria dominante e o resumo com total e pico', () => {
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
    expect(summary.textContent).toContain('18h')
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
    mockTrackRect(40000)
    fireEvent.click(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor('2026-07-05T18:03:00Z', 40000),
    })
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('CA2: pico em caso de empate de contagem entre horas escolhe a mais cedo', () => {
    // recordingItems chega em ordem DECRESCENTE de horário (mesma convenção de
    // HistoryPage.tsx) — 20h tem 2 itens inseridos ANTES de 5h, que também tem 2. Sem o
    // desempate correto (comparar a hora, não a ordem de iteração do Map), o resultado
    // seria 20h (a primeira inserida), não 5h (a mais cedo, esperado pela spec).
    const items = [
      item(4, '2026-07-05T20:10:00Z', 'continua'),
      item(3, '2026-07-05T20:00:00Z', 'continua'),
      item(2, '2026-07-05T05:10:00Z', 'continua'),
      item(1, '2026-07-05T05:00:00Z', 'continua'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    const summary = document.getElementById('history-timeline-summary')!
    expect(summary.textContent).toContain('5h')
    expect(summary.textContent).not.toContain('20h')
  })

  it('CA2labels: rótulos de TODAS as 24 horas aparecem, em formato compacto (sem zero-pad/sufixo "h")', () => {
    const items = [item(1, '2026-07-05T07:12:00Z', 'continua')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    const labels = Array.from(document.getElementById('history-timeline-labels')!.children).map(
      (el) => el.textContent,
    )
    expect(labels).toEqual(Array.from({ length: 24 }, (_, i) => String(i)))
  })

  it('CA4: mover o mouse sobre a trilha mostra um preview com miniatura e o horário, sem exigir clique', () => {
    vi.useFakeTimers()
    const items = [item(1, '2026-07-05T18:03:00Z', 'movimento')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    mockTrackRect(40000)

    expect(document.getElementById('history-timeline-preview')).toBeNull()

    fireEvent.mouseMove(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor('2026-07-05T18:03:00Z', 40000),
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
    mockTrackRect(40000)
    fireEvent.mouseMove(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor('2026-07-05T18:00:00Z', 40000),
    })
    act(() => vi.advanceTimersByTime(200))
    expect(document.getElementById('history-timeline-preview')).toBeNull()
  })

  it('CA4: mousemove contínuo reinicia o debounce — não busca uma imagem por posição intermediária', () => {
    vi.useFakeTimers()
    const onFrameRequests: string[] = []
    const items = [item(1, '2026-07-05T18:03:00Z', 'movimento')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    mockTrackRect(40000)
    const track = document.getElementById('history-timeline-track')!

    // Move o mouse por várias posições intermediárias em rápida sucessão (< debounce entre
    // cada uma) — só a ÚLTIMA posição deve gerar preview, nunca as intermediárias.
    for (const t of ['12:00:00Z', '13:00:00Z', '14:00:00Z', '18:03:00Z']) {
      fireEvent.mouseMove(track, { clientX: clientXFor(`2026-07-05T${t}`, 40000) })
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
    mockTrackRect(40000)
    const track = document.getElementById('history-timeline-track')!
    fireEvent.mouseMove(track, { clientX: clientXFor('2026-07-05T18:03:00Z', 40000) })
    act(() => vi.advanceTimersByTime(200))
    expect(document.getElementById('history-timeline-preview')).not.toBeNull()
    fireEvent.mouseLeave(track)
    expect(document.getElementById('history-timeline-preview')).toBeNull()
  })

  it('CA4: imagem de preview que falha mostra "sem prévia" em vez de manter a miniatura quebrada', () => {
    vi.useFakeTimers()
    const items = [item(1, '2026-07-05T18:03:00Z', 'movimento')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    mockTrackRect(40000)
    const track = document.getElementById('history-timeline-track')!
    fireEvent.mouseMove(track, { clientX: clientXFor('2026-07-05T18:03:00Z', 40000) })
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
    mockTrackRect(40000)
    fireEvent.click(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor('2026-07-05T18:20:00Z', 40000),
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
    mockTrackRect(40000)
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
    mockTrackRect(40000)
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
    mockTrackRect(40000)
    const handle = document.getElementById('history-timeline-handle')!
    fireEvent.pointerDown(handle, {
      clientX: clientXFor('2026-07-05T05:00:00Z', 40000),
      pointerId: 1,
    })
    fireEvent.pointerMove(handle, {
      clientX: clientXFor('2026-07-05T10:00:00Z', 40000),
      pointerId: 1,
    })
    fireEvent.pointerMove(handle, {
      clientX: clientXFor('2026-07-05T18:00:00Z', 40000),
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
    mockTrackRect(40000)
    const handle = document.getElementById('history-timeline-handle')!
    fireEvent.pointerDown(handle, {
      clientX: clientXFor('2026-07-05T05:00:00Z', 40000),
      pointerId: 1,
    })
    fireEvent.pointerMove(handle, {
      clientX: clientXFor('2026-07-05T18:00:00Z', 40000),
      pointerId: 1,
    })
    fireEvent.pointerUp(handle, {
      clientX: clientXFor('2026-07-05T18:00:00Z', 40000),
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
    mockTrackRect(40000)
    const handle = document.getElementById('history-timeline-handle')!
    fireEvent.pointerDown(handle, {
      clientX: clientXFor('2026-07-05T05:00:00Z', 40000),
      pointerId: 1,
    })
    fireEvent.pointerUp(handle, {
      clientX: clientXFor('2026-07-05T05:00:00Z', 40000),
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
    mockTrackRect(40000)
    const handle = document.getElementById('history-timeline-handle')!
    fireEvent.pointerDown(handle, {
      clientX: clientXFor('2026-07-05T05:00:00Z', 40000),
      pointerId: 1,
    })
    fireEvent.pointerMove(handle, {
      clientX: clientXFor('2026-07-05T05:03:00Z', 40000),
      pointerId: 1,
    })
    fireEvent.pointerUp(handle, {
      clientX: clientXFor('2026-07-05T05:03:00Z', 40000),
      pointerId: 1,
    })
    expect(onSelect).toHaveBeenCalledWith(1)
    const startFraction = clientXFor('2026-07-05T05:00:00Z', 40000) / 40000
    expect(handle.style.left).toBe(`${startFraction * 100}%`)
  })

  it('CA3linesnap: clicar numa lacuna sem gravação nenhuma também gruda no início da gravação real mais próxima, nunca num ponto livre', () => {
    const onSelect = vi.fn()
    const items = [
      item(1, '2026-07-05T05:00:00Z', 'continua'),
      item(2, '2026-07-05T18:00:00Z', 'movimento'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
    mockTrackRect(40000)
    // 10h: mais perto de 05:00 (5h de distância) do que de 18:00 (8h de distância) — gruda
    // no início da gravação 1, nunca na posição livre de 10h.
    fireEvent.click(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor('2026-07-05T10:00:00Z', 40000),
    })
    expect(onSelect).toHaveBeenCalledWith(1)
    const startFraction = clientXFor('2026-07-05T05:00:00Z', 40000) / 40000
    const handle = document.getElementById('history-timeline-handle')!
    expect(handle.style.left).toBe(`${startFraction * 100}%`)
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

  it('CA2vlines: mesmo numa trilha medida bem estreita, o bloco de hora usa a largura PADRÃO fixa (1621.5px) — nunca precisa do teto de 30% de separação, o piso já garante espaço de sobra', () => {
    // Desde que os blocos de hora ganharam uma largura padrão fixa (pedido do navigator:
    // "os boxes... devem ser mais largos independente se tem ou não gravação"), a largura
    // MEDIDA da trilha (via ResizeObserver) deixa de importar pra esse cálculo sempre que
    // for menor que o piso fixo — 263px medidos aqui são bem menores que os 1621.5px do
    // piso, então é o piso que vale (`Math.max`).
    let resizeCallback: ResizeObserverCallback | null = null
    class FakeResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)

    // 1s de diferença (não 5s): natural gap = 1/3600×100 ≈ 0.0278%, menor que o mínimo
    // aplicado aqui (0.2775%, ver abaixo) — precisa ser MENOR que o mínimo pra este teste
    // de fato exercitar o enforcement.
    const items = [
      item(1, '2026-07-05T00:00:00Z', 'continua'),
      item(2, '2026-07-05T00:00:01Z', 'continua'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)

    act(() => {
      resizeCallback?.(
        [{ contentRect: { width: 263 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      )
    })

    const left1 = document.getElementById('history-timeline-hour-0-rec-1')!.style.left
    const left2 = document.getElementById('history-timeline-hour-0-rec-2')!.style.left
    expect(left1).toBe('0%')
    // minLineGapFraction = (LINE_WIDTH_PX + LINE_GAP_PX) / 1621.5 (o piso fixo, não os
    // 263px medidos) — o mínimo é o PASSO inteiro (largura + margem), não só a margem:
    // `spreadFractions` aplica esse valor entre os CENTROS de linhas vizinhas, e cada
    // linha agora tem 3px de largura própria (não mais um traço de 1px) — só assim a
    // borda de uma linha e a da vizinha ficam de fato `LINE_GAP_PX` separadas.
    const minGapFraction = (4.5 / 1621.5) * 100
    expect(parseFloat(left2)).toBeCloseTo(minGapFraction, 5)
  })

  it('CA2vlines: numa trilha medida MAIOR que a largura padrão (24 blocos), o bloco de hora cresce além do piso fixo — a largura real ainda pode dominar', () => {
    // Complementa o teste acima: confirma que `Math.max` continua funcionando nos dois
    // sentidos — uma trilha genuinamente maior que 24×1621.5px+gaps (38939px) ainda faz os
    // blocos crescerem além do piso, com uma fração mínima ainda menor (mais espaço).
    let resizeCallback: ResizeObserverCallback | null = null
    class FakeResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)

    // 1s de diferença (não 5s) — mesmo motivo do teste acima: precisa ser menor que o
    // mínimo aplicado pra exercitar o enforcement, não só refletir a posição natural.
    const items = [
      item(1, '2026-07-05T00:00:00Z', 'continua'),
      item(2, '2026-07-05T00:00:01Z', 'continua'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)

    const measuredWidth = 40000 // > 24×1621.5+23 (38939) — maior que o piso fixo
    act(() => {
      resizeCallback?.(
        [{ contentRect: { width: measuredWidth } } as ResizeObserverEntry],
        {} as ResizeObserver,
      )
    })

    const left2 = document.getElementById('history-timeline-hour-0-rec-2')!.style.left
    const hourBoxWidthPx = (measuredWidth - 23) / 24
    // Mesmo motivo do teste acima: o mínimo é o PASSO inteiro (largura + margem).
    const minGapFraction = (4.5 / hourBoxWidthPx) * 100
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

  it('CAscroll: todo bloco de hora ganha a MESMA largura mínima PADRÃO (fixa, pra até 360 linhas) — com ou sem gravação, independente do quão cheio o dia está', () => {
    // Hora 7 com 50 gravações (simulação de reconexões rápidas do gravador); hora 18 com
    // só 1; hora 0 sem nenhuma. As 3 precisam ter o MESMO min-width — o padrão fixo
    // (360×3px + 361×1.5px de margem = 1621.5px), não um valor calculado a partir da
    // contagem real do dia: pedido do navigator ("os boxes... devem ser mais largos
    // independente se tem ou não gravação").
    const busyHour = Array.from({ length: 50 }, (_, i) =>
      item(i + 1, `2026-07-05T07:${String(i % 60).padStart(2, '0')}:00Z`, 'continua'),
    )
    const items = [...busyHour, item(999, '2026-07-05T18:00:00Z', 'pessoa')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    const expectedWidth = '1621.5px' // 360×3 + 361×1.5 (largura padrão fixa)
    expect(document.getElementById('history-timeline-hour-7')!.style.minWidth).toBe(expectedWidth)
    expect(document.getElementById('history-timeline-hour-18')!.style.minWidth).toBe(expectedWidth)
    expect(document.getElementById('history-timeline-hour-0')!.style.minWidth).toBe(expectedWidth)
    // Os rótulos de hora abaixo da régua acompanham a mesma largura, pra continuarem
    // alinhados sob o bloco correspondente mesmo com a régua rolando horizontalmente.
    const labels = document.getElementById('history-timeline-labels')!
    for (const label of Array.from(labels.children)) {
      expect((label as HTMLElement).style.minWidth).toBe(expectedWidth)
    }
  })

  it('CAscroll: dia comum (poucas gravações) ainda usa a largura padrão fixa — o scroll fica ativo por padrão, não só em dias cheios', () => {
    const items = [item(1, '2026-07-05T07:00:00Z', 'continua')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    expect(document.getElementById('history-timeline-hour-7')!.style.minWidth).toBe('1621.5px')
  })

  it('CAscroll: uma hora com mais gravações do que a capacidade padrão (360) faz o piso crescer além do valor fixo', () => {
    // Rede de segurança: 400 gravações numa hora só (acima do padrão de 360) precisam de
    // mais espaço do que o piso fixo garante sozinho.
    const items = Array.from({ length: 400 }, (_, i) =>
      item(i + 1, `2026-07-05T07:00:${String(i % 60).padStart(2, '0')}Z`, 'continua'),
    )
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    // 400×3 + 401×1.5 = 1801.5px > 1621.5px (o piso fixo).
    expect(document.getElementById('history-timeline-hour-7')!.style.minWidth).toBe('1801.5px')
  })

  it('CAscroll: clique numa régua "lotada" mapeia pro instante certo — não usa a largura VISÍVEL (cortada) como divisor da fração', () => {
    // Bug pego no code review: dividir pela largura visível/mockada (700px) em vez da
    // largura real do conteúdo (24 blocos de 60 gravações × 3px + gaps = 4343px) faria um
    // clique a 90% da área VISÍVEL (630px) resolver pra ~90% do DIA (~21h36, perto da
    // gravação da hora 20) — quando na verdade, na largura real do conteúdo, 630px cai
    // bem cedo (~3h30, perto das gravações da hora 0). 60 gravações na hora 0 (simulação
    // de reconexões rápidas do gravador) dominam `requiredHourWidthPx`; uma única
    // gravação isolada na hora 20 serve de "atrator" errado caso o bug volte.
    const onSelect = vi.fn()
    const busyHour = Array.from({ length: 60 }, (_, i) =>
      item(i + 1, `2026-07-05T00:${String(i % 60).padStart(2, '0')}:00Z`, 'continua'),
    )
    const items = [...busyHour, item(999, '2026-07-05T20:00:00Z', 'pessoa')]
    render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
    mockTrackRect(700) // largura VISÍVEL, bem menor que a largura real do conteúdo
    fireEvent.click(document.getElementById('history-timeline-track')!, { clientX: 630 })
    const selectedId = onSelect.mock.calls[0]![0] as number
    // Qualquer id de 1 a 60 (hora 0) está correto; 999 (hora 20) indicaria o bug de volta.
    expect(selectedId).not.toBe(999)
    expect(selectedId).toBeGreaterThanOrEqual(1)
    expect(selectedId).toBeLessThanOrEqual(60)
  })

  it('CAscroll: a alça (posição de repouso) usa pixels do CONTEÚDO real numa régua "lotada" — não porcentagem da janela visível', () => {
    // Bug pego no code review: `left: X%` resolvido contra o `.relative` (ancestral
    // posicionado da alça) sempre a largura VISÍVEL do scroll (nunca a do conteúdo
    // transbordante) fazia a alça flutuar grudada numa fração da JANELA, não na posição
    // real do dia — pior, deslizando junto com o próprio scroll.
    let resizeCallback: ResizeObserverCallback | null = null
    class FakeResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)

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
    act(() => {
      resizeCallback?.(
        [{ contentRect: { width: 700 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      )
    })

    // 60 gravações não chegam nem perto da capacidade padrão (360) — quem decide
    // `requiredHourWidthPx` aqui é o piso fixo (1621.5px, `DEFAULT_HOUR_WIDTH_PX`), não os
    // dados. contentWidthPx = max(700, 1621.5×24+23) = 38939 — bem maior que os 700px
    // "visíveis" mockados, exatamente o cenário de régua lotada por padrão. Se o bug
    // voltasse (`left: X%` contra a largura visível), o valor seria uma STRING de
    // porcentagem (ex. "2.01%"), nunca em px.
    const contentWidthPx = 1621.5 * 24 + 23
    const fraction = (Date.parse('2026-07-05T00:29:00Z') - DAY_START) / DAY_MS
    const handle = document.getElementById('history-timeline-handle')!
    // `toBeCloseTo` (não `toBe`) — o navegador arredonda o valor de `style.left` (px) com
    // menos casas decimais do que o float bruto do JS, então o texto exato varia.
    expect(handle.style.left.endsWith('px')).toBe(true)
    expect(parseFloat(handle.style.left)).toBeCloseTo(fraction * contentWidthPx, 2)
  })

  it('CAscroll: o container `#history-timeline-scroll` existe e permite rolagem horizontal', () => {
    const items = [item(1, '2026-07-05T07:00:00Z', 'continua')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    const scroll = document.getElementById('history-timeline-scroll')!
    expect(scroll.className).toContain('overflow-x-auto')
    expect(scroll.contains(document.getElementById('history-timeline-track'))).toBe(true)
    expect(scroll.contains(document.getElementById('history-timeline-labels'))).toBe(true)
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
    mockTrackRect(40000)
    const handle = document.getElementById('history-timeline-handle')!
    fireEvent.pointerDown(handle, {
      clientX: clientXFor('2026-07-05T05:00:00Z', 40000),
      pointerId: 1,
    })
    fireEvent.pointerMove(handle, {
      clientX: clientXFor('2026-07-05T06:30:00Z', 40000),
      pointerId: 1,
    })
    fireEvent.pointerUp(handle, {
      clientX: clientXFor('2026-07-05T06:30:00Z', 40000),
      pointerId: 1,
    })
    expect(onSelect).toHaveBeenCalledWith(2)
    const snappedFraction = clientXFor('2026-07-05T07:00:00Z', 40000) / 40000
    expect(handle.style.left).toBe(`${snappedFraction * 100}%`)
  })

  it('sem selectedId e sem arraste em andamento, a alça não aparece', () => {
    const items = [item(1, '2026-07-05T05:00:00Z', 'continua')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    expect(document.getElementById('history-timeline-handle')).toBeNull()
  })

  it('CA4spacing: a alça desce um pouco pra fora da caixa da trilha, e a linha de números tem espaço extra — sem encolher a seta', () => {
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
    // na borda (`bottom-0`).
    const handle = document.getElementById('history-timeline-handle')!
    expect(handle.className).toContain('-bottom-2')
    // A linha de números ganhou espaço extra (margem), abrindo a folga que falta pra ponta
    // da seta não cobrir os dígitos.
    const labels = document.getElementById('history-timeline-labels')!
    expect(labels.className).toMatch(/\bmt-\d/)
  })
})
