import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react'
import CameraCaptureSection from './CameraCaptureSection'
import type { Camera } from './cameraFormUtils'

vi.mock('../auth', () => ({ authHeaders: () => ({}) }))

const baseCam: Camera = {
  name: 'Corredor',
  id: 'cam-1',
  rtsp_url: 'rtsp://cam/stream',
  capture_type: 'rtsp',
  chunk_duration: '5m',
  reconnect_interval: '30s',
  video_codec: '',
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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CA3: CameraCaptureSection (edição) mostra Nome+Captura sempre editável, com Aplicar próprio', () => {
  it('renderiza o painel com Nome e Captura pré-preenchidos, e um botão Aplicar', () => {
    render(<CameraCaptureSection cam={baseCam} id="cam-1" reload={vi.fn()} />)
    const nameInput = document.getElementById('camera-form-name') as HTMLInputElement
    expect(nameInput.value).toBe('Corredor')
    const rtspInput = document.getElementById('camera-form-rtsp-url') as HTMLInputElement
    expect(rtspInput.value).toBe('rtsp://cam/stream')
    expect(document.getElementById('camera-capture-save')).toBeTruthy()
  })

  it('Aplicar envia PUT parcial: só os campos desta seção mudam, o resto vem de emptyForm(cam)', async () => {
    let sentBody: Record<string, unknown> | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }),
    )
    render(<CameraCaptureSection cam={baseCam} id="cam-1" reload={vi.fn()} />)

    fireEvent.change(document.getElementById('camera-form-name')!, {
      target: { value: 'Garagem' },
    })
    fireEvent.click(document.getElementById('camera-capture-save')!)

    await waitFor(() => expect(sentBody).not.toBeNull())
    expect(sentBody!.name).toBe('Garagem')
    // campos de outra seção continuam vindo do baseline (não some/zera).
    expect(sentBody!.recording_enabled).toBe(true)
  })

  it('quando a câmera persistida já está em live_transport=webrtc, o Codec de vídeo fica travado em h264', () => {
    render(
      <CameraCaptureSection
        cam={{ ...baseCam, live_transport: 'webrtc', video_codec: 'h264' }}
        id="cam-1"
        reload={vi.fn()}
      />,
    )
    const codecSelect = document.getElementById('camera-form-video-codec') as HTMLSelectElement
    expect(codecSelect.disabled).toBe(true)
    expect(codecSelect.value).toBe('h264')
  })

  it('Aplicar com live_transport=webrtc persistido NUNCA envia um video_codec diferente de h264, mesmo com um valor customizado (não aplicado) no form local', async () => {
    let sentBody: Record<string, unknown> | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }),
    )
    // câmera persistida já em webrtc, mas com um codec "hevc" divergente
    // (cenário hipotético de dado inconsistente) — o select fica desabilitado
    // e travado em h264, então não há como o usuário mudar o form local; o
    // payload precisa refletir 'h264' de qualquer forma, nunca `cam.video_codec`.
    render(
      <CameraCaptureSection
        cam={{ ...baseCam, live_transport: 'webrtc', video_codec: 'hevc' }}
        id="cam-1"
        reload={vi.fn()}
      />,
    )

    fireEvent.click(document.getElementById('camera-capture-save')!)

    await waitFor(() => expect(sentBody).not.toBeNull())
    expect(sentBody!.video_codec).toBe('h264')
  })
})
