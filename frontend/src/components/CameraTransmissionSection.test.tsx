import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react'
import CameraTransmissionSection from './CameraTransmissionSection'
import type { Camera } from './cameraFormUtils'

vi.mock('../auth', () => ({ authHeaders: () => ({}) }))

const baseCam: Camera = {
  name: 'Corredor',
  id: 'cam-1',
  rtsp_url: 'rtsp://cam/stream',
  capture_type: 'rtsp',
  chunk_duration: '5m',
  reconnect_interval: '30s',
  video_codec: 'hevc',
  has_audio: null,
  width: 0,
  height: 0,
  hls_video_mode: 'auto',
  record_video_mode: 'auto',
  live_transport: 'auto',
  hls_segment_seconds: null,
  hls_list_size: null,
  hls_dvr_seconds: null,
  recording_enabled: true,
  live_enabled: true,
  motion: null,
}

function withRtsp(rtsp_url: string): Camera {
  return { ...baseCam, rtsp_url }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CA4: CameraTransmissionSection (edição) sempre editável, com Aplicar próprio', () => {
  it('renderiza o painel de Transmissão pré-preenchido e um botão Aplicar', () => {
    render(<CameraTransmissionSection cam={baseCam} id="cam-1" reload={vi.fn()} />)
    expect(document.getElementById('camera-live-transport')).toBeTruthy()
    expect(document.getElementById('camera-transmission-save')).toBeTruthy()
  })

  it('"Detectar" usa a URL RTSP ATUAL de `cam` (não um snapshot antigo de `form`) — o campo RTSP mora na sessão Captura', async () => {
    let sentBody: Record<string, unknown> | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ codec: 'h264' }) })
      }),
    )
    const { rerender } = render(
      <CameraTransmissionSection cam={withRtsp('rtsp://old/main')} id="cam-1" reload={vi.fn()} />,
    )
    // Outra sessão (Captura) editou e salvou a URL principal sem remontar esta seção.
    rerender(
      <CameraTransmissionSection cam={withRtsp('rtsp://new/main')} id="cam-1" reload={vi.fn()} />,
    )

    fireEvent.click(document.getElementById('camera-live-transport-detect')!)

    await waitFor(() => expect(sentBody).not.toBeNull())
    expect(sentBody!.rtsp_url).toBe('rtsp://new/main')
  })
})

// --- capture_type propagado pro /detect-streams (história feat/capture-mjpeg) ---

describe('CA5: "Detectar" propaga capture_type pro backend', () => {
  it('envia capture_type junto com rtsp_url (bug pré-existente: endpoint sempre assumia RTSP)', async () => {
    let sentBody: Record<string, unknown> | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ codec: 'mjpeg' }) })
      }),
    )
    render(
      <CameraTransmissionSection
        cam={{
          ...baseCam,
          capture_type: 'mjpeg',
          rtsp_url: 'https://195.196.36.242/mjpg/video.mjpg',
        }}
        id="cam-1"
        reload={vi.fn()}
      />,
    )

    fireEvent.click(document.getElementById('camera-live-transport-detect')!)

    await waitFor(() => expect(sentBody).not.toBeNull())
    expect(sentBody!.capture_type).toBe('mjpeg')
  })
})

describe('CA5: selecionar Transporte=WebRTC força video_codec=h264 no payload salvo por Transmissão', () => {
  it('Aplicar com live_transport=webrtc envia video_codec=h264, mesmo a câmera tendo um codec customizado salvo', async () => {
    let sentBody: Record<string, unknown> | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }),
    )
    render(<CameraTransmissionSection cam={baseCam} id="cam-1" reload={vi.fn()} />)

    fireEvent.change(document.getElementById('camera-live-transport')!, {
      target: { value: 'webrtc' },
    })
    fireEvent.click(document.getElementById('camera-transmission-save')!)

    await waitFor(() => expect(sentBody).not.toBeNull())
    expect(sentBody!.live_transport).toBe('webrtc')
    expect(sentBody!.video_codec).toBe('h264')
  })

  it('Aplicar com transporte não-webrtc não mexe em video_codec (deixa a seção Captura decidir)', async () => {
    let sentBody: Record<string, unknown> | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }),
    )
    render(<CameraTransmissionSection cam={baseCam} id="cam-1" reload={vi.fn()} />)

    fireEvent.click(document.getElementById('camera-transmission-save')!)

    await waitFor(() => expect(sentBody).not.toBeNull())
    // video_codec vem só do baseline emptyForm(cam) — igual ao que já estava salvo.
    expect(sentBody!.video_codec).toBe('hevc')
  })
})
