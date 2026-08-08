import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import CameraForm from './CameraForm'

afterEach(cleanup)

function renderForm() {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const onCancel = vi.fn()
  render(<CameraForm onSave={onSave} onCancel={onCancel} saving={false} />)
  return { onSave, onCancel }
}

describe('CameraForm advanced section', () => {
  it('hides advanced streaming fields by default and shows the essentials', () => {
    renderForm()
    // Essentials always visible
    expect(screen.getByText('Nome')).toBeTruthy()
    expect(screen.getByText('RTSP URL')).toBeTruthy()
    expect(screen.getByText('Transporte do ao-vivo')).toBeTruthy()
    // "Tipo de captura" também sempre visível (história feat/camera-form-reshape)
    expect(screen.getByText('Codec de vídeo')).toBeTruthy()
    // Advanced streaming knobs collapsed
    expect(screen.queryByText('Modo de vídeo HLS')).toBeNull()
    expect(screen.queryByText('Retenção DVR (s)')).toBeNull()
  })

  it('reveals the advanced fields when the toggle is clicked', () => {
    renderForm()
    const toggle = document.getElementById('camera-advanced-toggle') as HTMLButtonElement
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Modo de vídeo HLS')).toBeTruthy()
    expect(screen.getByText('Retenção DVR (s)')).toBeTruthy()
  })

  it('submits all fields (advanced included) even while the section stays collapsed', () => {
    const { onSave } = renderForm()
    fireEvent.change(screen.getByPlaceholderText('Sala, Garagem, Entrada'), {
      target: { value: 'Garagem' },
    })
    fireEvent.change(screen.getByPlaceholderText('rtsp://usuario:senha@ip:554/stream'), {
      target: { value: 'rtsp://x/main' },
    })

    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const data = onSave.mock.calls[0][0]
    expect(data.name).toBe('Garagem')
    expect(data.rtsp_url).toBe('rtsp://x/main')
    // Advanced fields keep their defaults in the submitted form, though never shown.
    expect(data.hls_video_mode).toBe('auto')
    expect(data.record_video_mode).toBe('auto')
  })
})

describe('CA3: sessão "Tipo de captura" — seletor capture_type com campos condicionais', () => {
  it('default (rtsp): mostra a URL RTSP, o campo de substream e o botão de detecção', () => {
    renderForm()
    const select = document.getElementById('camera-capture-type') as HTMLSelectElement
    expect(select.value).toBe('rtsp')
    fireEvent.click(document.getElementById('camera-advanced-toggle')!)
    expect(document.getElementById('camera-motion-rtsp-url')).toBeTruthy()
    expect(document.getElementById('camera-motion-rtsp-detect')).toBeTruthy()
  })

  it('capture_type=hls: esconde o campo de substream e o botão de detecção (não fazem sentido pra HLS)', () => {
    renderForm()
    fireEvent.change(document.getElementById('camera-capture-type')!, {
      target: { value: 'hls' },
    })
    fireEvent.click(document.getElementById('camera-advanced-toggle')!)
    expect(document.getElementById('camera-motion-rtsp-url')).toBeNull()
    expect(document.getElementById('camera-motion-rtsp-detect')).toBeNull()
  })

  it('submete capture_type junto com o resto do form', () => {
    const { onSave } = renderForm()
    fireEvent.change(document.getElementById('camera-capture-type')!, {
      target: { value: 'hls' },
    })
    fireEvent.change(screen.getByPlaceholderText('Sala, Garagem, Entrada'), {
      target: { value: 'Garagem' },
    })
    fireEvent.change(screen.getByPlaceholderText('rtsp://usuario:senha@ip:554/stream'), {
      target: { value: 'https://cam.example.com/playlist.m3u8' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }))
    expect(onSave.mock.calls[0][0].capture_type).toBe('hls')
  })
})

describe('CA4: sessão "Gravação" esconde campos quando desligada; sessão "Transmissão" (live_enabled) esconde campos quando desligada', () => {
  it('desmarcar "Gravar em disco" esconde duração do chunk / intervalo de reconexão / modo de gravação', () => {
    renderForm()
    fireEvent.click(document.getElementById('camera-advanced-toggle')!)
    expect(document.getElementById('camera-form-chunk-duration')).toBeTruthy()

    fireEvent.click(document.getElementById('recording_enabled')!)

    expect(document.getElementById('camera-form-chunk-duration')).toBeNull()
    expect(document.getElementById('camera-form-reconnect-interval')).toBeNull()
    expect(document.getElementById('camera-form-record-video-mode')).toBeNull()
  })

  it('live_enabled ligado por padrão: mostra o seletor de transporte', () => {
    renderForm()
    expect(document.getElementById('camera-live-enabled')).toBeTruthy()
    expect((document.getElementById('camera-live-enabled') as HTMLInputElement).checked).toBe(true)
    expect(document.getElementById('camera-live-transport')).toBeTruthy()
  })

  it('desmarcar "Permitir transmissão" esconde o seletor de transporte e os campos HLS', () => {
    renderForm()
    fireEvent.click(document.getElementById('camera-advanced-toggle')!)
    expect(document.getElementById('camera-form-hls-video-mode')).toBeTruthy()

    fireEvent.click(document.getElementById('camera-live-enabled')!)

    expect(document.getElementById('camera-live-transport')).toBeNull()
    expect(document.getElementById('camera-form-hls-video-mode')).toBeNull()
  })
})
