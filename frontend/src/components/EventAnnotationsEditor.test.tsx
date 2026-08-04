import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import EventAnnotationsEditor from './EventAnnotationsEditor'

// O label de cada anotação aparece 2x na UI (overlay sobre a imagem + linha
// na lista textual, de propósito — ver T2 na story). `list()` escopa as
// buscas à lista (#event-annotations-list), evitando ambiguidade de
// "múltiplos elementos com o mesmo texto" nas asserções abaixo.
function list() {
  return within(document.getElementById('event-annotations-list')!)
}

// BboxCanvas exige interação de mouse real (drag) pra desenhar um retângulo
// — fora do escopo do que jsdom/happy-dom simula com confiança. Mockado por
// um botão que dispara onChange com um box fixo, mesmo padrão de mockar
// subcomponentes pesados já usado no projeto (ex. SettingsLayout em outros
// testes de página).
vi.mock('./BboxCanvas', () => ({
  default: ({ onChange }: { onChange: (box: unknown) => void }) => (
    <button type="button" onClick={() => onChange({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 })}>
      mock-canvas
    </button>
  ),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CA4: lista todas as anotações existentes do evento, não só a primeira', () => {
  it('mostra os labels das 2 anotações retornadas pela API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              { id: 1, label: 'pessoa', bbox_x: 0.3, bbox_y: 0.3, bbox_w: 0.2, bbox_h: 0.2 },
              { id: 2, label: 'carro', bbox_x: 0.6, bbox_y: 0.6, bbox_w: 0.3, bbox_h: 0.2 },
            ]),
            { status: 200 },
          ),
      ),
    )

    render(<EventAnnotationsEditor eventId={42} imageSrc="/fake.jpg" />)

    expect(await list().findByText('pessoa')).toBeTruthy()
    expect(await list().findByText('carro')).toBeTruthy()
  })
})

describe('CA5: adicionar uma nova anotação não apaga as existentes; remover uma não afeta as demais', () => {
  it('mantém "pessoa" ao adicionar "carro", e remove só a anotação alvo ao clicar Remover', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        const u = String(url)
        const method = init?.method ?? 'GET'
        if (u === '/api/events/42/annotations' && method === 'GET') {
          return new Response(
            JSON.stringify([
              { id: 1, label: 'pessoa', bbox_x: 0.3, bbox_y: 0.3, bbox_w: 0.2, bbox_h: 0.2 },
            ]),
            { status: 200 },
          )
        }
        if (u === '/api/events/42/annotations' && method === 'POST') {
          return new Response(JSON.stringify({ id: 2 }), { status: 201 })
        }
        if (u === '/api/annotations/1' && method === 'DELETE') {
          return new Response(null, { status: 204 })
        }
        return new Response('{}', { status: 200 })
      }),
    )

    render(<EventAnnotationsEditor eventId={42} imageSrc="/fake.jpg" />)

    expect(await list().findByText('pessoa')).toBeTruthy()

    fireEvent.click(screen.getByText('Nova anotação'))
    fireEvent.click(screen.getByText('mock-canvas'))
    fireEvent.change(screen.getByLabelText(/label da anotação/i), { target: { value: 'carro' } })
    fireEvent.click(screen.getByText('Salvar anotação'))

    expect(await list().findByText('carro')).toBeTruthy()
    expect(list().getByText('pessoa')).toBeTruthy()

    fireEvent.click(within(list().getByText('pessoa').closest('li')!).getByText('Remover'))
    await waitFor(() => expect(list().queryByText('pessoa')).toBeNull())
    expect(list().getByText('carro')).toBeTruthy()
  })

  it('chama onAnnotationSaved com o label salvo, tanto ao criar quanto ao editar (sincroniza o label do evento)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        const u = String(url)
        const method = init?.method ?? 'GET'
        if (u === '/api/events/42/annotations' && method === 'GET') {
          return new Response(JSON.stringify([]), { status: 200 })
        }
        if (u === '/api/events/42/annotations' && method === 'POST') {
          return new Response(JSON.stringify({ id: 1 }), { status: 201 })
        }
        if (u === '/api/annotations/1' && method === 'PATCH') {
          return new Response('{}', { status: 200 })
        }
        return new Response('{}', { status: 200 })
      }),
    )
    const onAnnotationSaved = vi.fn()

    render(
      <EventAnnotationsEditor
        eventId={42}
        imageSrc="/fake.jpg"
        onAnnotationSaved={onAnnotationSaved}
      />,
    )
    await waitFor(() => expect(list().queryByText('Carregando…')).toBeNull())

    fireEvent.click(screen.getByText('Nova anotação'))
    fireEvent.click(screen.getByText('mock-canvas'))
    fireEvent.change(screen.getByLabelText(/label da anotação/i), { target: { value: 'gato' } })
    fireEvent.click(screen.getByText('Salvar anotação'))
    await list().findByText('gato')

    expect(onAnnotationSaved).toHaveBeenCalledTimes(1)
    expect(onAnnotationSaved).toHaveBeenCalledWith('gato')

    fireEvent.click(within(list().getByText('gato').closest('li')!).getByText('Editar'))
    fireEvent.click(screen.getByText('mock-canvas'))
    fireEvent.change(screen.getByLabelText(/label da anotação/i), { target: { value: 'cachorro' } })
    fireEvent.click(screen.getByText('Salvar anotação'))
    await list().findByText('cachorro')

    expect(onAnnotationSaved).toHaveBeenCalledTimes(2)
    expect(onAnnotationSaved).toHaveBeenLastCalledWith('cachorro')
  })
})
