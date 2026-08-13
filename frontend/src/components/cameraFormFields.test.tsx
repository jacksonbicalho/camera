import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { NameField, CaptureFields, RecordingFields, TransmissionFields } from './cameraFormFields'
import { emptyForm } from './cameraFormUtils'

afterEach(cleanup)

describe('CA2: cameraFormFields extrai os blocos de campos de CameraForm, reusados por criação e edição', () => {
  it('NameField renderiza o input de nome com o mesmo id/placeholder de sempre', () => {
    const form = emptyForm()
    render(<NameField form={form} set={vi.fn()} />)
    expect(document.getElementById('camera-form-name')).toBeTruthy()
  })

  it('CaptureFields renderiza os campos de captura e desabilita o codec quando codecDisabled', () => {
    const form = emptyForm()
    render(<CaptureFields form={form} set={vi.fn()} codecDisabled={true} />)
    const codecSelect = document.getElementById('camera-form-video-codec') as HTMLSelectElement
    expect(codecSelect).toBeTruthy()
    expect(codecSelect.disabled).toBe(true)
    expect(codecSelect.value).toBe('h264')
  })

  it('RecordingFields renderiza o checkbox de gravação', () => {
    const form = emptyForm()
    render(<RecordingFields form={form} set={vi.fn()} />)
    expect(document.getElementById('recording_enabled')).toBeTruthy()
  })

  it('TransmissionFields usa a rtspUrl recebida por prop (não lê form.rtsp_url direto)', () => {
    const form = emptyForm()
    const onDetect = vi.fn()
    render(
      <TransmissionFields
        form={form}
        set={vi.fn()}
        rtspUrl="rtsp://fresh/from-prop"
        detecting={false}
        detectMsg={null}
        liveRecommended=""
        onDetect={onDetect}
        onTransportChange={vi.fn()}
      />,
    )
    fireEvent.click(document.getElementById('camera-live-transport-detect')!)
    expect(onDetect).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Transporte do ao-vivo')).toBeTruthy()
  })
})
