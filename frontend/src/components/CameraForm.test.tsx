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

describe('CameraForm sessões — Nome / Captura / Gravação / Transmissão sempre visíveis', () => {
  it('mostra todas as sessões sem nenhum toggle "Configurações avançadas" (removido — história feat/camera-form-reshape)', () => {
    renderForm()
    expect(screen.getByText('Nome')).toBeTruthy()
    expect(screen.getByText('RTSP URL')).toBeTruthy()
    expect(screen.getByText('Codec de vídeo')).toBeTruthy()
    expect(screen.getByText('Intervalo de reconexão')).toBeTruthy()
    expect(screen.getByText('Transporte do ao-vivo')).toBeTruthy()
    expect(screen.getByText('Modo de vídeo HLS')).toBeTruthy()
    expect(screen.getByText('Retenção DVR (s)')).toBeTruthy()
    expect(document.getElementById('camera-advanced-toggle')).toBeNull()
  })

  it('submits all fields', () => {
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
    expect(data.hls_video_mode).toBe('auto')
    expect(data.record_video_mode).toBe('auto')
  })
})

describe('CA3: sessão "Captura" — seletor capture_type com campos condicionais', () => {
  it('default (rtsp): mostra "RTSP URL" como rótulo', () => {
    renderForm()
    const select = document.getElementById('camera-capture-type') as HTMLSelectElement
    expect(select.value).toBe('rtsp')
    expect(screen.getByText('RTSP URL')).toBeTruthy()
    // O campo de substream (motion_rtsp_url) não é mais desta sessão — migrou
    // pra "Detecção de movimento" (CameraMotionSection, história T4).
    expect(document.getElementById('camera-motion-rtsp-url')).toBeNull()
  })

  it('capture_type=hls: troca o rótulo/placeholder da URL', () => {
    renderForm()
    fireEvent.change(document.getElementById('camera-capture-type')!, {
      target: { value: 'hls' },
    })
    expect(screen.getByText('URL HLS')).toBeTruthy()
    expect(screen.queryByText('RTSP URL')).toBeNull()
  })

  it('submete capture_type junto com o resto do form', () => {
    const { onSave } = renderForm()
    fireEvent.change(document.getElementById('camera-capture-type')!, {
      target: { value: 'hls' },
    })
    fireEvent.change(screen.getByPlaceholderText('Sala, Garagem, Entrada'), {
      target: { value: 'Garagem' },
    })
    fireEvent.change(screen.getByPlaceholderText('https://exemplo.com/stream/playlist.m3u8'), {
      target: { value: 'https://cam.example.com/playlist.m3u8' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }))
    expect(onSave.mock.calls[0][0].capture_type).toBe('hls')
  })
})

describe('CA4: sessão "Gravação" esconde campos quando desligada; sessão "Transmissão" (live_enabled) esconde campos quando desligada', () => {
  it('desmarcar "Gravar em disco" esconde duração do chunk / modo de gravação (intervalo de reconexão é da sessão Captura, continua visível)', () => {
    renderForm()
    expect(document.getElementById('camera-form-chunk-duration')).toBeTruthy()

    fireEvent.click(document.getElementById('recording_enabled')!)

    expect(document.getElementById('camera-form-chunk-duration')).toBeNull()
    expect(document.getElementById('camera-form-record-video-mode')).toBeNull()
    expect(document.getElementById('camera-form-reconnect-interval')).toBeTruthy()
  })

  it('live_enabled ligado por padrão: mostra o seletor de transporte', () => {
    renderForm()
    expect(document.getElementById('camera-live-enabled')).toBeTruthy()
    expect((document.getElementById('camera-live-enabled') as HTMLInputElement).checked).toBe(true)
    expect(document.getElementById('camera-live-transport')).toBeTruthy()
  })

  it('desmarcar "Permitir transmissão" esconde o seletor de transporte e os campos HLS', () => {
    renderForm()
    expect(document.getElementById('camera-form-hls-video-mode')).toBeTruthy()

    fireEvent.click(document.getElementById('camera-live-enabled')!)

    expect(document.getElementById('camera-live-transport')).toBeNull()
    expect(document.getElementById('camera-form-hls-video-mode')).toBeNull()
  })

  it('selecionar Transporte=WebRTC força Codec de vídeo=H.264 (desabilitado) e esconde os campos HLS (HLS desligado, sem fallback)', () => {
    renderForm()
    const codecSelect = document.getElementById('camera-form-video-codec') as HTMLSelectElement
    fireEvent.change(codecSelect, { target: { value: 'hevc' } })
    expect(codecSelect.value).toBe('hevc')

    fireEvent.change(document.getElementById('camera-live-transport')!, {
      target: { value: 'webrtc' },
    })

    expect(codecSelect.value).toBe('h264')
    expect(codecSelect.disabled).toBe(true)
    expect(document.getElementById('camera-form-hls-video-mode')).toBeNull()
    expect(document.getElementById('camera-form-hls-segment-seconds')).toBeNull()
    expect(document.getElementById('camera-form-hls-list-size')).toBeNull()
    expect(document.getElementById('camera-form-hls-dvr-seconds')).toBeNull()
    expect(screen.getByText(/HLS desligado/)).toBeTruthy()
  })

  it('sair do WebRTC restaura o Codec de vídeo customizado anterior, em vez de deixar h264 preso', () => {
    renderForm()
    const codecSelect = document.getElementById('camera-form-video-codec') as HTMLSelectElement
    fireEvent.change(codecSelect, { target: { value: 'hevc' } })

    fireEvent.change(document.getElementById('camera-live-transport')!, {
      target: { value: 'webrtc' },
    })
    expect(codecSelect.value).toBe('h264')

    fireEvent.change(document.getElementById('camera-live-transport')!, {
      target: { value: 'auto' },
    })

    expect(codecSelect.value).toBe('hevc')
    expect(codecSelect.disabled).toBe(false)
  })
})
