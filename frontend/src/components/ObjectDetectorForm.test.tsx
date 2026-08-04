import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ObjectDetectorForm from './ObjectDetectorForm'

afterEach(cleanup)

// CA7 (história feat/detector-adapter-pattern): o cadastro de detector ganha
// um seletor de tipo (yolo/hugging face) — cada tipo expõe seus próprios
// campos. onSave é deliberadamente vi.fn() sem tipagem estrita: o shape final
// de ObjectDetectorFormData (que ganha `type`) só é fixado durante a própria
// implementação deste ticket.
describe('CA7: ObjectDetectorForm exibe seletor de tipo e alterna entre os campos de yolo/hugging face', () => {
  it('inicia com o tipo yolo selecionado e os campos yolo visíveis', () => {
    render(<ObjectDetectorForm onSave={vi.fn()} onCancel={vi.fn()} saving={false} />)

    const typeSelect = screen.getByLabelText(/tipo/i) as HTMLSelectElement
    expect(typeSelect.value).toBe('yolo')
    expect(screen.getByLabelText(/url do serviço/i)).toBeTruthy()
    expect(screen.queryByLabelText(/model id/i)).toBeNull()
  })

  it('ao selecionar hugging face, troca os campos yolo pelos campos model id/api token', () => {
    render(<ObjectDetectorForm onSave={vi.fn()} onCancel={vi.fn()} saving={false} />)

    const typeSelect = screen.getByLabelText(/tipo/i) as HTMLSelectElement
    fireEvent.change(typeSelect, { target: { value: 'huggingface' } })

    expect(screen.queryByLabelText(/url do serviço/i)).toBeNull()
    expect(screen.getByLabelText(/model id/i)).toBeTruthy()
    expect(screen.getByLabelText(/api token/i)).toBeTruthy()
  })

  it('ao salvar com tipo hugging face, onSave recebe type e os campos preenchidos', () => {
    const onSave = vi.fn()
    render(<ObjectDetectorForm onSave={onSave} onCancel={vi.fn()} saving={false} />)

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'HF Detector' } })
    fireEvent.change(screen.getByLabelText(/tipo/i), { target: { value: 'huggingface' } })
    fireEvent.change(screen.getByLabelText(/model id/i), {
      target: { value: 'facebook/detr-resnet-50' },
    })
    fireEvent.change(screen.getByLabelText(/api token/i), { target: { value: 'hf_secret' } })
    fireEvent.click(screen.getByText(/salvar/i))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]
    expect(saved.type).toBe('huggingface')
    expect(saved.config.model_id).toBe('facebook/detr-resnet-50')
    expect(saved.config.api_token).toBe('hf_secret')
  })
})

// CA8 (história feat/detector-adapter-pattern, ticket T7): a URL da Inference
// API da Hugging Face é editável — nunca só hardcoded — porque o host padrão
// (api-inference.huggingface.co) parou de responder; descoberto testando
// contra a API real (curl), não pela documentação.
describe('CA8: campo de URL opcional pro tipo hugging face', () => {
  it('exibe um campo de URL opcional (sem required) quando o tipo é hugging face', () => {
    render(<ObjectDetectorForm onSave={vi.fn()} onCancel={vi.fn()} saving={false} />)

    fireEvent.change(screen.getByLabelText(/tipo/i), { target: { value: 'huggingface' } })

    const urlInput = screen.getByLabelText(/url \(opcional\)/i) as HTMLInputElement
    expect(urlInput.required).toBe(false)
  })

  it('inclui a URL preenchida no config enviado a onSave', () => {
    const onSave = vi.fn()
    render(<ObjectDetectorForm onSave={onSave} onCancel={vi.fn()} saving={false} />)

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'HF Detector' } })
    fireEvent.change(screen.getByLabelText(/tipo/i), { target: { value: 'huggingface' } })
    fireEvent.change(screen.getByLabelText(/model id/i), {
      target: { value: 'facebook/detr-resnet-50' },
    })
    fireEvent.change(screen.getByLabelText(/api token/i), { target: { value: 'hf_secret' } })
    fireEvent.change(screen.getByLabelText(/url \(opcional\)/i), {
      target: { value: 'https://router.huggingface.co/hf-inference/models/' },
    })
    fireEvent.click(screen.getByText(/salvar/i))

    const saved = onSave.mock.calls[0][0]
    expect(saved.config.service_url).toBe('https://router.huggingface.co/hf-inference/models/')
  })
})
