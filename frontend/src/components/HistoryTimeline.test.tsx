import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, fireEvent } from '@testing-library/react'
import HistoryTimeline from './HistoryTimeline'
import type { Recording } from '../pages/cameraUtils'
import type { RecordingCategory } from '../pages/eventCategory'

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

  it('CA3: clique na trilha seleciona a gravação mais próxima daquele instante', () => {
    const onSelect = vi.fn()
    const items = [
      item(2, '2026-07-05T18:20:00Z', 'pessoa'),
      item(1, '2026-07-05T18:03:00Z', 'movimento'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" />)
    mockTrackRect(2400)
    fireEvent.click(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor('2026-07-05T18:03:00Z', 2400),
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
    mockTrackRect(2400)

    expect(document.getElementById('history-timeline-preview')).toBeNull()

    fireEvent.mouseMove(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor('2026-07-05T18:03:00Z', 2400),
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
    mockTrackRect(2400)
    fireEvent.mouseMove(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor('2026-07-05T18:00:00Z', 2400),
    })
    act(() => vi.advanceTimersByTime(200))
    expect(document.getElementById('history-timeline-preview')).toBeNull()
  })

  it('CA4: mousemove contínuo reinicia o debounce — não busca uma imagem por posição intermediária', () => {
    vi.useFakeTimers()
    const onFrameRequests: string[] = []
    const items = [item(1, '2026-07-05T18:03:00Z', 'movimento')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    mockTrackRect(2400)
    const track = document.getElementById('history-timeline-track')!

    // Move o mouse por várias posições intermediárias em rápida sucessão (< debounce entre
    // cada uma) — só a ÚLTIMA posição deve gerar preview, nunca as intermediárias.
    for (const t of ['12:00:00Z', '13:00:00Z', '14:00:00Z', '18:03:00Z']) {
      fireEvent.mouseMove(track, { clientX: clientXFor(`2026-07-05T${t}`, 2400) })
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
    mockTrackRect(2400)
    const track = document.getElementById('history-timeline-track')!
    fireEvent.mouseMove(track, { clientX: clientXFor('2026-07-05T18:03:00Z', 2400) })
    act(() => vi.advanceTimersByTime(200))
    expect(document.getElementById('history-timeline-preview')).not.toBeNull()
    fireEvent.mouseLeave(track)
    expect(document.getElementById('history-timeline-preview')).toBeNull()
  })

  it('CA4: imagem de preview que falha mostra "sem prévia" em vez de manter a miniatura quebrada', () => {
    vi.useFakeTimers()
    const items = [item(1, '2026-07-05T18:03:00Z', 'movimento')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    mockTrackRect(2400)
    const track = document.getElementById('history-timeline-track')!
    fireEvent.mouseMove(track, { clientX: clientXFor('2026-07-05T18:03:00Z', 2400) })
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
    mockTrackRect(2400)
    fireEvent.click(document.getElementById('history-timeline-track')!, {
      clientX: clientXFor('2026-07-05T18:20:00Z', 2400),
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
    mockTrackRect(2400)
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
    mockTrackRect(2400)
    fireEvent.click(document.getElementById('history-timeline-track')!, { clientX: 9999 })
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
    mockTrackRect(2400)
    const handle = document.getElementById('history-timeline-handle')!
    fireEvent.pointerDown(handle, {
      clientX: clientXFor('2026-07-05T05:00:00Z', 2400),
      pointerId: 1,
    })
    fireEvent.pointerMove(handle, {
      clientX: clientXFor('2026-07-05T10:00:00Z', 2400),
      pointerId: 1,
    })
    fireEvent.pointerMove(handle, {
      clientX: clientXFor('2026-07-05T18:00:00Z', 2400),
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
    mockTrackRect(2400)
    const handle = document.getElementById('history-timeline-handle')!
    fireEvent.pointerDown(handle, {
      clientX: clientXFor('2026-07-05T05:00:00Z', 2400),
      pointerId: 1,
    })
    fireEvent.pointerMove(handle, {
      clientX: clientXFor('2026-07-05T18:00:00Z', 2400),
      pointerId: 1,
    })
    fireEvent.pointerUp(handle, {
      clientX: clientXFor('2026-07-05T18:00:00Z', 2400),
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
    mockTrackRect(2400)
    const handle = document.getElementById('history-timeline-handle')!
    fireEvent.pointerDown(handle, {
      clientX: clientXFor('2026-07-05T05:00:00Z', 2400),
      pointerId: 1,
    })
    fireEvent.pointerUp(handle, {
      clientX: clientXFor('2026-07-05T05:00:00Z', 2400),
      pointerId: 1,
    })
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('CA5drag: soltar dentro da MESMA gravação (mesmo id resolvido) mantém a alça na posição solta, não pula de volta pro início dela', () => {
    // A cobertura de uma gravação é de CHUNK_FALLBACK_MS (5min) a partir do início — soltar
    // 3min depois do início ainda resolve pro MESMO id (1), então onSelect(1) não muda o
    // selectedId (HistoryPage não re-renderiza com um selectedId novo). Mesmo assim, a alça
    // deve continuar na posição solta (05:03), não voltar pro início da gravação (05:00) —
    // "snapar de volta" é a queixa relatada ("não consigo arrastar pouco dentro da mesma
    // cor": um arraste pequeno o bastante pra não trocar de gravação parecia "não fazer
    // nada" porque a alça voltava pro início.
    const onSelect = vi.fn()
    const items = [item(1, '2026-07-05T05:00:00Z', 'continua')]
    render(
      <HistoryTimeline recordingItems={items} onSelect={onSelect} cameraId="cam1" selectedId={1} />,
    )
    mockTrackRect(2400)
    const handle = document.getElementById('history-timeline-handle')!
    fireEvent.pointerDown(handle, {
      clientX: clientXFor('2026-07-05T05:00:00Z', 2400),
      pointerId: 1,
    })
    fireEvent.pointerMove(handle, {
      clientX: clientXFor('2026-07-05T05:03:00Z', 2400),
      pointerId: 1,
    })
    fireEvent.pointerUp(handle, {
      clientX: clientXFor('2026-07-05T05:03:00Z', 2400),
      pointerId: 1,
    })
    expect(onSelect).toHaveBeenCalledWith(1)
    const droppedFraction = clientXFor('2026-07-05T05:03:00Z', 2400) / 2400
    expect(handle.style.left).toBe(`${droppedFraction * 100}%`)
  })

  it('sem selectedId e sem arraste em andamento, a alça não aparece', () => {
    const items = [item(1, '2026-07-05T05:00:00Z', 'continua')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} cameraId="cam1" />)
    expect(document.getElementById('history-timeline-handle')).toBeNull()
  })
})
