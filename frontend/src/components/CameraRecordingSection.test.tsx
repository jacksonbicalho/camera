import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react'
import CameraRecordingSection from './CameraRecordingSection'
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

describe('CA4: CameraRecordingSection (edição) sempre editável, com Aplicar próprio', () => {
  it('renderiza o painel de Gravação pré-preenchido e um botão Aplicar', () => {
    render(<CameraRecordingSection cam={baseCam} id="cam-1" reload={vi.fn()} />)
    expect((document.getElementById('recording_enabled') as HTMLInputElement).checked).toBe(true)
    expect(document.getElementById('camera-recording-save')).toBeTruthy()
  })

  it('Aplicar envia PUT parcial: só recording_enabled/chunk_duration/record_video_mode mudam', async () => {
    let sentBody: Record<string, unknown> | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }),
    )
    render(<CameraRecordingSection cam={baseCam} id="cam-1" reload={vi.fn()} />)

    fireEvent.click(document.getElementById('recording_enabled')!)
    fireEvent.click(document.getElementById('camera-recording-save')!)

    await waitFor(() => expect(sentBody).not.toBeNull())
    expect(sentBody!.recording_enabled).toBe(false)
    // não mexe em campos de outras seções.
    expect(sentBody!.name).toBe('Corredor')
    expect(sentBody!.live_enabled).toBe(true)
  })
})
