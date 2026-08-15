import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, fireEvent, screen, waitFor } from '@testing-library/react'
import { MotionTelegramNotify } from './CameraMotionTelegramNotify'
import { MotionFormContent, MotionReadOnly } from './CameraMotionSection'
import type { Camera } from './cameraFormUtils'
import type { CameraSettings } from '../hooks/useSettings'

vi.mock('./MotionScoreChart', () => ({ default: () => <div id="motion-score-chart" /> }))
vi.mock('../auth', () => ({ authHeaders: () => ({}) }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

afterEach(cleanup)

function mockPrefsAndNotify(opts: {
  telegramActive: boolean
  telegramLinked: boolean
  enabled?: boolean
  minScore?: number
}) {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/me/preferences') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          telegram_active: opts.telegramActive,
          telegram_linked: opts.telegramLinked,
        }),
      })
    }
    if (url.includes('/telegram-notify')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ enabled: opts.enabled ?? false, min_score: opts.minScore ?? 0.02 }),
      })
    }
    return Promise.resolve({ ok: false, text: async () => '' })
  })
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('CA6: MotionTelegramNotify — oculto sem as 3 condições cumulativas', () => {
  it('motionEnabled=false: não renderiza nada, nem faz fetch', async () => {
    mockPrefsAndNotify({ telegramActive: true, telegramLinked: true })
    render(<MotionTelegramNotify cameraId="cam-1" motionEnabled={false} />)
    await new Promise((r) => setTimeout(r, 0))
    expect(document.getElementById('motion-telegram-notify-enabled')).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('telegram_active=false: fica oculto mesmo com motion habilitado e telegram vinculado', async () => {
    mockPrefsAndNotify({ telegramActive: false, telegramLinked: true })
    render(<MotionTelegramNotify cameraId="cam-1" motionEnabled={true} />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(document.getElementById('motion-telegram-notify-enabled')).toBeNull()
  })

  it('telegram_linked=false: fica oculto mesmo com motion habilitado e extensão ativa', async () => {
    mockPrefsAndNotify({ telegramActive: true, telegramLinked: false })
    render(<MotionTelegramNotify cameraId="cam-1" motionEnabled={true} />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(document.getElementById('motion-telegram-notify-enabled')).toBeNull()
  })

  it('GET /telegram-notify falha (500) mesmo com /preferences OK: fica oculto, nunca mostra os defaults (evita sobrescrever silenciosamente uma preferência real ao Aplicar)', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/me/preferences') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ telegram_active: true, telegram_linked: true }),
        })
      }
      return Promise.resolve({ ok: false, text: async () => 'internal error' })
    })
    render(<MotionTelegramNotify cameraId="cam-1" motionEnabled={true} />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    expect(document.getElementById('motion-telegram-notify-enabled')).toBeNull()
  })

  it('falha transitória seguida de troca de câmera com sucesso: não fica oculto pra sempre (loadFailed reseta a cada tentativa)', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({ ok: false, text: async () => '' }))
    const { rerender } = render(<MotionTelegramNotify cameraId="cam-1" motionEnabled={true} />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    expect(document.getElementById('motion-telegram-notify-enabled')).toBeNull()

    mockPrefsAndNotify({ telegramActive: true, telegramLinked: true })
    // MotionFormContent/MotionReadOnly não remontam ao trocar de câmera — a
    // mesma instância recebe um cameraId novo via prop.
    rerender(<MotionTelegramNotify cameraId="cam-2" motionEnabled={true} />)

    await waitFor(() =>
      expect(document.getElementById('motion-telegram-notify-enabled')).toBeTruthy(),
    )
  })
})

describe('CA6: MotionTelegramNotify — visível com as 3 condições, Aplicar envia o payload correto', () => {
  it('renderiza checkbox + score mínimo, e Aplicar faz PUT com {enabled, min_score}', async () => {
    mockPrefsAndNotify({
      telegramActive: true,
      telegramLinked: true,
      enabled: false,
      minScore: 0.02,
    })
    render(<MotionTelegramNotify cameraId="cam-1" motionEnabled={true} />)

    await waitFor(() =>
      expect(document.getElementById('motion-telegram-notify-enabled')).toBeTruthy(),
    )

    fireEvent.click(document.getElementById('motion-telegram-notify-enabled')!)
    fireEvent.change(document.getElementById('motion-telegram-notify-min-score')!, {
      target: { value: '0.07' },
    })

    mockFetch.mockImplementationOnce(() => Promise.resolve({ ok: true, text: async () => '' }))
    const callsBefore = mockFetch.mock.calls.length
    fireEvent.click(screen.getByText('Aplicar'))
    await waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore))

    const [putUrl, putInit] = mockFetch.mock.calls.at(-1)!
    expect(putUrl).toBe('/api/cameras/cam-1/telegram-notify')
    expect(putInit.method).toBe('PUT')
    const body = JSON.parse(putInit.body)
    expect(body).toEqual({ enabled: true, min_score: 0.07 })
  })
})

describe('CA6: montado tanto em MotionFormContent (admin) quanto MotionReadOnly (viewer)', () => {
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

  function viewerCam(over: Partial<CameraSettings> = {}): CameraSettings {
    return {
      id: 'cam-1',
      name: 'Corredor',
      motion: { enabled: true, threshold: 0.02, fps: 2, cooldown_seconds: 30 },
      ...over,
    } as CameraSettings
  }

  it('MotionFormContent: aparece quando motion está habilitado e telegram ativo+vinculado', async () => {
    mockPrefsAndNotify({ telegramActive: true, telegramLinked: true })
    render(<MotionFormContent cam={baseCam()} id="cam-1" peak={null} reload={() => {}} />)
    await waitFor(() =>
      expect(document.getElementById('motion-telegram-notify-enabled')).toBeTruthy(),
    )
  })

  it('MotionReadOnly: aparece quando motion está habilitado e telegram ativo+vinculado', async () => {
    mockPrefsAndNotify({ telegramActive: true, telegramLinked: true })
    render(<MotionReadOnly cam={viewerCam()} id="cam-1" peak={null} />)
    await waitFor(() =>
      expect(document.getElementById('motion-telegram-notify-enabled')).toBeTruthy(),
    )
  })

  it('MotionReadOnly: câmera com movimento desabilitado não monta o bloco (nem chama fetch)', async () => {
    mockPrefsAndNotify({ telegramActive: true, telegramLinked: true })
    render(<MotionReadOnly cam={viewerCam({ motion: null })} id="cam-1" peak={null} />)
    await new Promise((r) => setTimeout(r, 0))
    expect(document.getElementById('motion-telegram-notify-enabled')).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
