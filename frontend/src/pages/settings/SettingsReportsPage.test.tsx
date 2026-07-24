import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import SettingsReportsPage from './SettingsReportsPage'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
  getRole: () => 'admin',
}))
vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../components/DatePicker', () => ({ default: () => <div data-testid="datepicker" /> }))

function LocationProbe() {
  const location = useLocation()
  return <div id="test-location">{location.pathname}</div>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/reports" element={<SettingsReportsPage />} />
        <Route path="/settings/reports/:cameraId/:date/:days" element={<SettingsReportsPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

const cameras = [{ id: 'cam1', name: 'Corredor' }]

// 3 dias × 24h zero-fill, com 22/9h = 4 (máximo) e 23/12h = 2
const HEAT_DATES = ['2026-06-22', '2026-06-23', '2026-06-24']
function makeHeatmap() {
  const cells: { date: string; hour: number; count: number }[] = []
  for (const date of HEAT_DATES) {
    for (let h = 0; h < 24; h++) {
      let count = 0
      if (date === '2026-06-22' && h === 9) count = 4
      if (date === '2026-06-23' && h === 12) count = 2
      cells.push({ date, hour: h, count })
    }
  }
  return cells
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/cameras'))
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cameras) })
      if (url.includes('bucket=heatmap'))
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ total: 6, heatmap: makeHeatmap() }),
        })
      if (url.startsWith('/api/reports/events'))
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ total: 0, by_day: [], by_label: {} }),
        })
      return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ReportsPage cabeçalho', () => {
  it('mostra o nome da câmera selecionada como subtítulo, acima da linha de estatísticas', async () => {
    renderAt('/settings/reports/cam1/2026-06-24/7')
    const name = await waitFor(() => {
      const el = document.getElementById('report-camera-name')
      if (!el) throw new Error('nome da câmera não renderizou')
      return el
    })
    expect(name.textContent).toContain('Corredor')

    // a linha de estatísticas existe e vem DEPOIS (abaixo) do nome da câmera
    const stats = document.getElementById('report-stats-line')
    expect(stats?.textContent).toContain('no período')
    expect(name.compareDocumentPosition(stats!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('ReportsPage heatmap', () => {
  it('busca o bucket=heatmap e renderiza uma linha por dia, rotulada DD + dia da semana', async () => {
    renderAt('/settings/reports/cam1/2026-06-24/7')

    await waitFor(() => {
      const grid = document.getElementById('report-heatmap')
      if (!grid) throw new Error('heatmap não renderizou')
    })

    // uma linha por dia (3 dias) com 24 células cada
    const rows = document.querySelectorAll('[id^="report-heatmap-row-"]')
    expect(rows.length).toBe(HEAT_DATES.length)
    expect(document.querySelectorAll('[id^="report-heatmap-cell-2026-06-22-"]').length).toBe(24)

    // ordem mais recente no topo: a 1ª linha é o último dia (2026-06-24)
    expect(rows[0].id).toBe('report-heatmap-row-2026-06-24')

    // rótulo "22/06/2026 Seg" (2026-06-22 é segunda-feira); data dd/mm/yyyy + dia da semana
    const row22 = document.getElementById('report-heatmap-row-2026-06-22')
    expect(row22?.textContent).toContain('22/06/2026 Seg')

    // célula com mais eventos (22/9h) tem o título com a contagem
    expect(
      document.getElementById('report-heatmap-cell-2026-06-22-9')?.getAttribute('title'),
    ).toContain('4')

    // um fetch com bucket=heatmap foi disparado
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock.mock.calls.some(([u]: [string]) => u.includes('bucket=heatmap'))).toBe(true)
  })

  it('rotula todas as 24 horas (0–23) no cabeçalho do heatmap', async () => {
    renderAt('/settings/reports/cam1/2026-06-24/7')
    const grid = await waitFor(() => {
      const el = document.getElementById('report-heatmap')
      if (!el) throw new Error('heatmap não renderizou')
      return el
    })
    const header = grid.querySelector('div')!.firstElementChild as HTMLElement
    const labels = Array.from(header.children).map((c) => c.textContent)
    expect(labels).toEqual(Array.from({ length: 24 }, (_, h) => String(h)))
  })

  it('no modo "1 dia" esconde o heatmap e busca barras por hora', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    renderAt('/settings/reports/cam1/2026-06-24/7')
    await waitFor(() => {
      if (!document.getElementById('report-heatmap')) throw new Error('heatmap não renderizou')
    })

    const range = document.getElementById('report-range-select') as HTMLSelectElement
    fireEvent.change(range, { target: { value: '1' } })

    await waitFor(() => {
      if (document.getElementById('report-heatmap'))
        throw new Error('heatmap deveria sumir no modo 1 dia')
    })
    expect(fetchMock.mock.calls.some(([u]: [string]) => u.includes('bucket=hour'))).toBe(true)
  })
})

describe('ReportsPage rota (câmera/data/range na URL)', () => {
  it('inicializa câmera e range a partir dos parâmetros da URL', async () => {
    renderAt('/settings/reports/cam1/2026-06-24/3')
    await waitFor(() => {
      if (!document.getElementById('report-camera-name')) throw new Error('não renderizou')
    })
    expect((document.getElementById('report-camera-select') as HTMLSelectElement).value).toBe(
      'cam1',
    )
    expect((document.getElementById('report-range-select') as HTMLSelectElement).value).toBe('3')
  })

  it('range inválido na URL cai pro mais próximo em vez de quebrar', async () => {
    renderAt('/settings/reports/cam1/2026-06-24/999')
    await waitFor(() => {
      if (!document.getElementById('report-camera-name')) throw new Error('não renderizou')
    })
    expect((document.getElementById('report-range-select') as HTMLSelectElement).value).toBe('90')
  })

  it('trocar o range pelo seletor atualiza a URL (compartilhável)', async () => {
    renderAt('/settings/reports/cam1/2026-06-24/7')
    await waitFor(() => {
      if (!document.getElementById('report-camera-name')) throw new Error('não renderizou')
    })
    fireEvent.change(document.getElementById('report-range-select')!, { target: { value: '14' } })
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe(
        '/settings/reports/cam1/2026-06-24/14',
      )
    })
  })
})

describe('CA5: categorias dinâmicas (barras/donut/modal), não mais um bucket fixo "IA"', () => {
  function stubDynamicReport() {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/cameras'))
          return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
        if (url.startsWith('/api/reports/events') && url.includes('bucket=hour')) {
          return Promise.resolve({
            status: 200,
            json: () =>
              Promise.resolve({
                total: 10,
                by_hour: [
                  {
                    hour: 10,
                    count: 10,
                    by_category: { pessoa: 3, movimento: 2, carro: 5 },
                  },
                ],
                // by_label é a ÚNICA fonte de pessoa/movimento/carro pra categoryBuckets
                // (usado no total da legenda/modal) — by_category (topo) só carrega
                // categorias que NÃO vêm de label (hoje só "estados"), nunca duplica o que
                // já está em by_label. by_hour[].by_category é um campo DIFERENTE (a
                // composição de CADA hora, usada pelas barras empilhadas).
                by_label: { pessoa: 3, '': 2, carro: 5 },
              }),
          })
        }
        return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
      }),
    )
  }

  it('barras empilhadas: um label específico dinâmico (ex.: "carro") aparece com sua PRÓPRIA cor, não mais bucket "ia"', async () => {
    stubDynamicReport()
    renderAt('/settings/reports/cam1/2026-06-24/1')
    await waitFor(() => {
      expect(document.getElementById('report-bars')).not.toBeNull()
    })
    const bar = document.getElementById('report-bars')!.firstElementChild as HTMLElement
    expect(bar.getAttribute('title')).toContain('Carro: 5')
    // 3 segmentos empilhados (pessoa, movimento, carro) — pessoa primeiro, movimento
    // depois, "carro" (resto alfabético) por último.
    const segments = Array.from(bar.querySelectorAll('button')).map((b) => b.getAttribute('title'))
    expect(segments).toEqual(['Pessoa: 3', 'Movimento: 2', 'Carro: 5'])
  })

  it('donut: legenda mostra o label real capitalizado ("Carro"), com a cor determinística de categoryColor', async () => {
    stubDynamicReport()
    renderAt('/settings/reports/cam1/2026-06-24/1')
    await waitFor(() => {
      expect(document.getElementById('report-bars')).not.toBeNull()
    })
    const legendButtons = Array.from(document.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Carro'),
    )
    expect(legendButtons).toHaveLength(1)
    expect(legendButtons[0].textContent).toContain('5')
    const dot = legendButtons[0].querySelector('span')!
    expect(dot.className).toMatch(/bg-\w+-\d+/)
  })

  it('clicar no segmento/legenda de um label dinâmico abre o modal com título capitalizado e descrição fiel ao label (não mais "Detecções de modelos de IA")', async () => {
    stubDynamicReport()
    renderAt('/settings/reports/cam1/2026-06-24/1')
    await waitFor(() => {
      expect(document.getElementById('report-bars')).not.toBeNull()
    })
    const carroSegment = Array.from(document.querySelectorAll('button')).find(
      (b) => b.getAttribute('title') === 'Carro: 5',
    )!
    fireEvent.click(carroSegment)
    const modal = await waitFor(() => {
      const el = document.getElementById('report-category-modal')
      if (!el) throw new Error('modal não abriu')
      return el
    })
    expect(modal.textContent).toContain('Carro — 5 eventos')
    expect(modal.textContent).toContain('Detecções classificadas como "Carro"')
    expect(modal.textContent).not.toContain('IA')
  })
})

// CA6: aba Relatórios dentro de Servidor — sem câmera pré-selecionada mostra
// o seletor (não o relatório); com câmera selecionada (testes acima, todos
// renderizados a partir de /settings/reports/:cameraId/:date/:days) mostra o
// relatório de verdade.
describe('CA6: aba Relatórios — seletor de câmera sem :cameraId, relatório com :cameraId', () => {
  it('sem :cameraId (rota "/settings/reports") mostra o seletor de câmera, não o relatório', async () => {
    renderAt('/settings/reports')
    await waitFor(() => {
      expect(document.getElementById('settings-reports-camera-picker')).toBeTruthy()
    })
    expect(document.getElementById('report-bars')).toBeNull()
    expect(document.getElementById('report-camera-select')).toBeNull()
  })

  it('escolher uma câmera no seletor navega pra "/settings/reports/:cameraId/hoje/1"', async () => {
    renderAt('/settings/reports')
    fireEvent.click(document.getElementById('settings-reports-camera-picker')!)
    await waitFor(() => {
      expect(document.getElementById('settings-reports-camera-picker-camera-cam1')).toBeTruthy()
    })
    fireEvent.click(document.getElementById('settings-reports-camera-picker-camera-cam1')!)
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toMatch(
        /^\/settings\/reports\/cam1\/\d{4}-\d{2}-\d{2}\/1$/,
      )
    })
  })

  it('com :cameraId mostra o relatório (não o seletor)', async () => {
    renderAt('/settings/reports/cam1/2026-06-24/7')
    await waitFor(() => {
      expect(document.getElementById('report-camera-select')).toBeTruthy()
    })
    expect(document.getElementById('settings-reports-camera-picker')).toBeNull()
  })
})
