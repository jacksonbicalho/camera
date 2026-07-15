import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import HistoryTimeline from './HistoryTimeline'
import type { Recording } from '../pages/cameraUtils'
import type { RecordingCategory } from '../pages/eventCategory'

afterEach(cleanup)

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

describe('HistoryTimeline', () => {
  it('CA2: renderiza um bloco por hora colorido pela categoria dominante e o resumo com total e pico', () => {
    const items = [
      item(1, '2026-07-05T07:12:00Z', 'continua'),
      item(2, '2026-07-05T18:03:00Z', 'movimento'),
      item(3, '2026-07-05T18:20:00Z', 'pessoa'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} />)

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
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} />)
    const hour0 = document.getElementById('history-timeline-hour-0')!
    expect(hour0.className).toContain('bg-surface-2')
  })

  it('CA2: sem nenhuma gravação, não renderiza nada', () => {
    const { container } = render(<HistoryTimeline recordingItems={[]} onSelect={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('CA3: clique num bloco chama onSelect com o id da primeira gravação daquela hora', () => {
    const onSelect = vi.fn()
    const items = [
      item(2, '2026-07-05T18:20:00Z', 'pessoa'),
      item(1, '2026-07-05T18:03:00Z', 'movimento'),
    ]
    render(<HistoryTimeline recordingItems={items} onSelect={onSelect} />)
    document
      .getElementById('history-timeline-hour-18')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
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
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} />)
    const summary = document.getElementById('history-timeline-summary')!
    expect(summary.textContent).toContain('5h')
    expect(summary.textContent).not.toContain('20h')
  })

  it('CA3: rótulos de hora aparecem a cada 4h (00h/04h/.../24h)', () => {
    const items = [item(1, '2026-07-05T07:12:00Z', 'continua')]
    render(<HistoryTimeline recordingItems={items} onSelect={vi.fn()} />)
    for (const label of ['00h', '04h', '08h', '12h', '16h', '20h', '24h']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })
})
