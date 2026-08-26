import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, fireEvent, screen } from '@testing-library/react'
import { MotionFormContent, MotionReadOnly } from './CameraMotionSection'
import type { Camera } from './cameraFormUtils'
import type { CameraSettings } from '../hooks/useSettings'

vi.mock('./MotionScoreChart', () => ({
  default: (props: { cameraId: string; threshold: number; dailyPeak?: number }) => (
    <div
      id="motion-score-chart"
      data-camera-id={props.cameraId}
      data-threshold={props.threshold}
      data-daily-peak={props.dailyPeak ?? ''}
    />
  ),
}))
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
vi.mock('../auth', () => ({ authHeaders: () => ({}) }))

afterEach(cleanup)

function baseCam(over: Partial<Camera> = {}): Camera {
  return {
    id: 'cam-1',
    name: 'Corredor',
    rtsp_url: 'rtsp://cam/stream',
    chunk_duration: '5m',
    reconnect_interval: '30s',
    video_codec: '',
    has_audio: null,
    width: 0,
    height: 0,
    hls_video_mode: 'auto',
    record_video_mode: 'auto',
    hls_segment_seconds: null,
    hls_list_size: null,
    hls_dvr_seconds: null,
    recording_enabled: true,
    motion: { enabled: true, threshold: 0.02, fps: 2, cooldown_seconds: 30 },
    ...over,
  }
}

describe('MotionFormContent — checkbox "Habilitado" sempre visível', () => {
  it('renderiza o checkbox motion_enabled', () => {
    const { getByLabelText } = render(
      <MotionFormContent cam={baseCam()} id="cam-1" peak={null} reload={() => {}} />,
    )
    expect(getByLabelText('Habilitado')).toBeTruthy()
  })
})

describe('CA5: substream RTSP (motion_rtsp_url) migrou pra "Detecção de movimento" — condicional por capture_type', () => {
  it('capture_type=rtsp (default): mostra o campo de substream e o botão de detecção', () => {
    render(<MotionFormContent cam={baseCam()} id="cam-1" peak={null} reload={() => {}} />)
    expect(document.getElementById('camera-motion-rtsp-url')).toBeTruthy()
    expect(document.getElementById('camera-motion-rtsp-detect')).toBeTruthy()
  })

  it('capture_type=hls: esconde o campo de substream e o botão de detecção', () => {
    render(
      <MotionFormContent
        cam={baseCam({ capture_type: 'hls' })}
        id="cam-1"
        peak={null}
        reload={() => {}}
      />,
    )
    expect(document.getElementById('camera-motion-rtsp-url')).toBeNull()
    expect(document.getElementById('camera-motion-rtsp-detect')).toBeNull()
  })

  it('desmarcar "Habilitado" esconde o campo de substream também', () => {
    render(<MotionFormContent cam={baseCam()} id="cam-1" peak={null} reload={() => {}} />)
    expect(document.getElementById('camera-motion-rtsp-url')).toBeTruthy()
    fireEvent.click(document.getElementById('motion_enabled')!)
    expect(document.getElementById('camera-motion-rtsp-url')).toBeNull()
  })
})

describe('salvar não reverte edições feitas em outras sessões (MotionFormContent fica montado o tempo todo, sem remount ao trocar de rota)', () => {
  it('handleSave envia os dados ATUAIS de `cam` (não um snapshot antigo) pros campos que não são de movimento', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' })
    const { rerender } = render(
      <MotionFormContent
        cam={baseCam({ name: 'Nome antigo' })}
        id="cam-1"
        peak={null}
        reload={() => {}}
      />,
    )
    // Simula outra sessão (CameraForm) salvando e `reload()` atualizando `cam` —
    // MotionFormContent não remonta (mesma instância), só recebe um `cam` novo.
    rerender(
      <MotionFormContent
        cam={baseCam({ name: 'Nome novo' })}
        id="cam-1"
        peak={null}
        reload={() => {}}
      />,
    )

    const callsBefore = mockFetch.mock.calls.length
    fireEvent.click(screen.getByText('Aplicar'))
    await vi.waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore))

    const body = JSON.parse(mockFetch.mock.calls.at(-1)![1].body)
    expect(body.name).toBe('Nome novo')
  })

  it('handleSave limpa motion_rtsp_url quando outra sessão trocou capture_type pra hls nesse meio-tempo (campo escondido não deve persistir valor morto)', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' })
    const { rerender } = render(
      <MotionFormContent
        cam={baseCam({ capture_type: 'rtsp' })}
        id="cam-1"
        peak={null}
        reload={() => {}}
      />,
    )
    fireEvent.change(document.getElementById('camera-motion-rtsp-url')!, {
      target: { value: 'rtsp://sub/stream' },
    })
    // Outra sessão (Captura) trocou capture_type pra hls sem remontar esta seção.
    rerender(
      <MotionFormContent
        cam={baseCam({ capture_type: 'hls' })}
        id="cam-1"
        peak={null}
        reload={() => {}}
      />,
    )

    const callsBefore = mockFetch.mock.calls.length
    fireEvent.click(screen.getByText('Aplicar'))
    await vi.waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore))

    const body = JSON.parse(mockFetch.mock.calls.at(-1)![1].body)
    expect(body.motion_rtsp_url).toBe('')
  })

  it('"Detectar" substream usa a URL RTSP ATUAL de `cam` (não um snapshot antigo de `form`)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ motion_rtsp_url: 'rtsp://detected/sub' }),
    })
    const { rerender } = render(
      <MotionFormContent
        cam={baseCam({ rtsp_url: 'rtsp://old/main' })}
        id="cam-1"
        peak={null}
        reload={() => {}}
      />,
    )
    // Outra sessão (Captura) editou e salvou a URL principal sem remontar esta seção.
    rerender(
      <MotionFormContent
        cam={baseCam({ rtsp_url: 'rtsp://new/main' })}
        id="cam-1"
        peak={null}
        reload={() => {}}
      />,
    )

    const callsBefore = mockFetch.mock.calls.length
    fireEvent.click(document.getElementById('camera-motion-rtsp-detect')!)
    await vi.waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore))

    const body = JSON.parse(mockFetch.mock.calls.at(-1)![1].body)
    expect(body.rtsp_url).toBe('rtsp://new/main')
  })
})

describe('MotionReadOnly não duplica o título "Detecção de movimento"', () => {
  function viewerCam(over: Partial<CameraSettings> = {}): CameraSettings {
    return {
      id: 'cam-1',
      name: 'Corredor',
      motion: null,
      ...over,
    } as CameraSettings
  }

  it('desabilitado: o título aparece exatamente 1 vez', () => {
    render(<MotionReadOnly cam={viewerCam()} id="cam-1" peak={null} />)
    expect(screen.getAllByText('Detecção de movimento')).toHaveLength(1)
  })

  it('habilitado: o título aparece exatamente 1 vez', () => {
    render(
      <MotionReadOnly
        cam={viewerCam({
          motion: { enabled: true, threshold: 0.02, fps: 2, cooldown_seconds: 30 },
        })}
        id="cam-1"
        peak={null}
      />,
    )
    expect(screen.getAllByText('Detecção de movimento')).toHaveLength(1)
  })
})

describe('CA3: MotionScoreChart recebe o pico do dia como dailyPeak', () => {
  function viewerCam(over: Partial<CameraSettings> = {}): CameraSettings {
    return {
      id: 'cam-1',
      name: 'Corredor',
      motion: { enabled: true, threshold: 0.009, fps: 2, cooldown_seconds: 30 },
      ...over,
    } as CameraSettings
  }

  it('MotionReadOnly repassa peak.peak_raw_score', () => {
    render(<MotionReadOnly cam={viewerCam()} id="cam-1" peak={{ peak_raw_score: 0.017 }} />)
    const chart = document.getElementById('motion-score-chart')
    expect(chart?.getAttribute('data-daily-peak')).toBe('0.017')
  })

  it('MotionReadOnly com peak null deixa dailyPeak indefinido (sem quebrar)', () => {
    render(<MotionReadOnly cam={viewerCam()} id="cam-1" peak={null} />)
    const chart = document.getElementById('motion-score-chart')
    expect(chart?.getAttribute('data-daily-peak')).toBe('')
  })

  it('MotionFormContent repassa peak.peak_raw_score', () => {
    render(
      <MotionFormContent
        cam={baseCam()}
        id="cam-1"
        peak={{ peak_raw_score: 0.017 }}
        reload={() => {}}
      />,
    )
    const chart = document.getElementById('motion-score-chart')
    expect(chart?.getAttribute('data-daily-peak')).toBe('0.017')
  })
})
