import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import TrainerForm from './TrainerForm'

afterEach(cleanup)

// CA5 (história feat/trainer-adapter-pattern): TrainerForm — mirror de
// ObjectDetectorForm, mas só o tipo "yolo" está implementado por enquanto
// (o <select> de tipo já existe, com 1 opção só, desabilitado — nasce
// preparado pra crescer sem remodelar quando um 2º backend aparecer).
describe('CA5: TrainerForm salva nome/tipo/service_url/model', () => {
  it('inicia com o tipo yolo e os campos URL do serviço/modelo visíveis (modelo com default yolov8n)', () => {
    render(<TrainerForm onSave={vi.fn()} onCancel={vi.fn()} saving={false} />)

    const typeSelect = screen.getByLabelText(/tipo/i) as HTMLSelectElement
    expect(typeSelect.value).toBe('yolo')
    expect(screen.getByLabelText(/url do serviço/i)).toBeTruthy()
    const modelInput = screen.getByLabelText(/modelo/i) as HTMLInputElement
    expect(modelInput.value).toBe('yolov8n')
  })

  it('ao salvar, onSave recebe name/type/config com o service_url e o modelo preenchidos', () => {
    const onSave = vi.fn()
    render(<TrainerForm onSave={onSave} onCancel={vi.fn()} saving={false} />)

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'YOLO principal' } })
    fireEvent.change(screen.getByLabelText(/url do serviço/i), {
      target: { value: 'http://yolo:8001' },
    })
    fireEvent.change(screen.getByLabelText(/modelo/i), { target: { value: 'yolo11n' } })
    fireEvent.click(screen.getByText(/salvar/i))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]
    expect(saved.name).toBe('YOLO principal')
    expect(saved.type).toBe('yolo')
    expect(saved.config.service_url).toBe('http://yolo:8001')
    expect(saved.config.model).toBe('yolo11n')
  })
})
