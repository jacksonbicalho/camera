import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import CameraPickerFlyout from './CameraPickerFlyout'
import { DisplayModeProvider } from '../contexts/DisplayModeContext'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
}))

const cameras = [
  { id: 'cam1', name: 'Corredor' },
  { id: 'cam2', name: 'Quintal' },
]

function LocationProbe() {
  const location = useLocation()
  return <div id="test-location">{location.pathname}</div>
}

function renderPicker() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <DisplayModeProvider>
        <CameraPickerFlyout
          id="picker"
          label="Escolher câmera"
          icon={<span />}
          showLabel={false}
          activePrefix="/picked"
          buildTarget={(cameraId) => `/picked/${cameraId}`}
        />
      </DisplayModeProvider>
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('CameraPickerFlyout', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(cameras) })),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('é um botão que não busca câmeras antes de ser aberto', () => {
    renderPicker()
    const btn = document.getElementById('picker')!
    expect(btn.tagName).toBe('BUTTON')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('ao clicar, busca /api/cameras e lista as câmeras no flyout', async () => {
    renderPicker()
    fireEvent.click(document.getElementById('picker')!)
    await waitFor(() => {
      expect(document.getElementById('picker-camera-cam1')).toBeTruthy()
      expect(document.getElementById('picker-camera-cam2')).toBeTruthy()
    })
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/cameras')
  })

  it('clicar numa câmera navega pro destino calculado por buildTarget e fecha o flyout', async () => {
    renderPicker()
    fireEvent.click(document.getElementById('picker')!)
    await waitFor(() => expect(document.getElementById('picker-camera-cam2')).toBeTruthy())
    fireEvent.click(document.getElementById('picker-camera-cam2')!)
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/picked/cam2')
    })
    expect(document.getElementById('picker-camera-cam2')).toBeNull()
  })

  it('fica ativo (bg-primary) em qualquer rota que comece com activePrefix', () => {
    render(
      <MemoryRouter initialEntries={['/picked/cam1']}>
        <DisplayModeProvider>
          <CameraPickerFlyout
            id="picker"
            label="Escolher câmera"
            icon={<span />}
            showLabel={false}
            activePrefix="/picked"
            buildTarget={(cameraId) => `/picked/${cameraId}`}
          />
        </DisplayModeProvider>
      </MemoryRouter>,
    )
    expect(document.getElementById('picker')?.className).toContain('bg-primary')
  })
})
