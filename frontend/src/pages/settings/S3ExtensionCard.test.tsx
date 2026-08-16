import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import S3ExtensionCard from './S3ExtensionCard'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))

function mockFetch(
  existing: Array<Record<string, string>>,
  spy?: (method: string, url: string, body: unknown) => void,
  s3Active = false,
  s3Available = true,
) {
  let currentActive = s3Active
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method ?? 'GET'
      if (u === '/api/retention-extensions' && method === 'GET') {
        return new Response(JSON.stringify(existing), { status: 200 })
      }
      if (u === '/api/settings/extensions' && method === 'GET') {
        return new Response(
          JSON.stringify([
            {
              id: 's3',
              name: 'S3',
              category: 'Retenção',
              description: 'Armazenamento em nuvem compatível com S3.',
              available: s3Available,
              active: currentActive,
            },
          ]),
          { status: 200 },
        )
      }
      const body = init?.body ? JSON.parse(String(init.body)) : null
      if (u === '/api/settings/extensions/s3' && method === 'PUT') {
        currentActive = Boolean((body as { active?: boolean } | null)?.active)
      }
      spy?.(method, u, body)
      return new Response(JSON.stringify({ id: 'new-id', ...(body ?? {}) }), { status: 201 })
    }),
  )
}

function switchChecked(el: HTMLElement) {
  return el.getAttribute('aria-checked') === 'true'
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CA5: a página Extensões mostra o conteúdo completo do S3, junto do Telegram, num card só', () => {
  it('sem "Ativado" marcado, não mostra o formulário de destino', async () => {
    mockFetch([])
    render(<S3ExtensionCard />)

    await screen.findByText('S3')
    expect(screen.queryByLabelText(/^nome/i)).toBeNull()
  })

  it('marcar "Ativado" revela o formulário de destino', async () => {
    mockFetch([])
    render(<S3ExtensionCard />)

    const toggle = await screen.findByRole('switch')
    expect(screen.queryByLabelText(/^nome/i)).toBeNull()
    fireEvent.click(toggle)
    await screen.findByLabelText(/^nome/i)
  })

  it('sem nenhuma linha existente, marcar Ativado + preencher + "Aplicar" salva o destino (POST) e ativa (PUT active=true)', async () => {
    const calls: { method: string; url: string; body: unknown }[] = []
    mockFetch([], (method, url, body) => calls.push({ method, url, body }))
    render(<S3ExtensionCard />)

    fireEvent.click(await screen.findByRole('switch'))
    fireEvent.change(await screen.findByLabelText(/^nome/i), { target: { value: 'meu-s3' } })
    fireEvent.change(screen.getByLabelText(/bucket/i), { target: { value: 'meu-bucket' } })
    fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'AK' } })
    fireEvent.change(screen.getByLabelText(/secret key/i), { target: { value: 'SK' } })

    fireEvent.click(document.getElementById('s3-config-apply')!)

    await waitFor(() => {
      const createCall = calls.find((c) => c.url === '/api/retention-extensions')
      expect(createCall?.method).toBe('POST')
      expect(createCall?.body).toMatchObject({ name: 'meu-s3', bucket: 'meu-bucket' })
      const activeCall = calls.find((c) => c.url === '/api/settings/extensions/s3')
      expect(activeCall?.method).toBe('PUT')
      expect(activeCall?.body).toEqual({ active: true })
    })
  })

  it('com uma linha já existente e já ativo, "Configurar" revela o form pré-populado; "Aplicar" dispara PUT /api/retention-extensions/:id', async () => {
    const calls: { method: string; url: string; body: unknown }[] = []
    mockFetch(
      [
        {
          id: 'ext1',
          name: 'destino-atual',
          endpoint: '',
          bucket: 'bucket-atual',
          region: 'us-east-1',
          prefix: '',
        },
      ],
      (method, url, body) => calls.push({ method, url, body }),
      true,
    )
    render(<S3ExtensionCard />)

    await screen.findByText('S3')
    expect(screen.queryByLabelText(/^nome/i)).toBeNull()

    fireEvent.click(await screen.findByRole('button', { name: /configurar/i }))
    const nameInput = (await screen.findByLabelText(/^nome/i)) as HTMLInputElement
    await waitFor(() => expect(nameInput.value).toBe('destino-atual'))

    fireEvent.change(nameInput, { target: { value: 'destino-novo' } })
    fireEvent.click(document.getElementById('s3-config-apply')!)

    await waitFor(() => {
      const updateCall = calls.find((c) => c.url === '/api/retention-extensions/ext1')
      expect(updateCall?.method).toBe('PUT')
    })
  })

  it('desmarcar "Ativado" e aplicar só desativa (PUT active=false) — não mexe na config salva', async () => {
    const calls: { method: string; url: string; body: unknown }[] = []
    mockFetch(
      [
        {
          id: 'ext1',
          name: 'destino-atual',
          endpoint: '',
          bucket: 'bucket-atual',
          region: 'us-east-1',
          prefix: '',
        },
      ],
      (method, url, body) => calls.push({ method, url, body }),
      true,
    )
    render(<S3ExtensionCard />)

    const toggle = await screen.findByRole('switch')
    await waitFor(() => expect(switchChecked(toggle)).toBe(true))
    fireEvent.click(toggle)
    fireEvent.click(document.getElementById('s3-config-apply')!)

    await waitFor(() => {
      const activeCall = calls.find((c) => c.url === '/api/settings/extensions/s3')
      expect(activeCall?.method).toBe('PUT')
      expect(activeCall?.body).toEqual({ active: false })
      expect(
        calls.some((c) => c.method === 'PUT' && c.url === '/api/retention-extensions/ext1'),
      ).toBe(false)
    })
  })

  it('"Excluir configuração" só aparece com uma config existente, e chama DELETE ao confirmar', async () => {
    mockFetch(
      [
        {
          id: 'ext1',
          name: 'destino-atual',
          endpoint: '',
          bucket: 'bucket-atual',
          region: 'us-east-1',
          prefix: '',
        },
      ],
      undefined,
      true,
    )
    render(<S3ExtensionCard />)

    await screen.findByText('S3')
    fireEvent.click(await screen.findByRole('button', { name: /excluir configuração/i }))

    let deleteMethod = ''
    let deleteUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        deleteMethod = init?.method ?? 'GET'
        deleteUrl = String(url)
        return new Response(null, { status: 204 })
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /^excluir$/i }))

    await waitFor(() => {
      expect(deleteMethod).toBe('DELETE')
      expect(deleteUrl).toBe('/api/retention-extensions/ext1')
    })
  })

  it('sem config existente, "Excluir configuração" não aparece', async () => {
    mockFetch([])
    render(<S3ExtensionCard />)

    await screen.findByText('S3')
    expect(screen.queryByRole('button', { name: /excluir configuração/i })).toBeNull()
  })

  it('quando a extensão não está disponível, mostra o toggle travado junto do aviso (nome continua visível, mesma altura do card habilitado)', async () => {
    mockFetch([], undefined, false, false)
    render(<S3ExtensionCard />)

    await screen.findByText('Extensão não permitida nesta instância.')
    const toggle = screen.getByRole('switch') as HTMLButtonElement
    expect(toggle.closest('fieldset')?.disabled).toBe(true)
    expect(screen.getByText('S3')).toBeTruthy()
  })
})

describe('CA2: card do S3 nasce sempre fechado (mesmo tamanho dos outros), abre por Configurar ou pelo toggle, fecha ao aplicar', () => {
  it('extensão já ativa: o formulário NÃO aparece até "Configurar" ou o toggle serem acionados', async () => {
    mockFetch(
      [
        {
          id: 'ext1',
          name: 'destino-atual',
          endpoint: '',
          bucket: 'bucket-atual',
          region: 'us-east-1',
          prefix: '',
        },
      ],
      undefined,
      true,
    )
    render(<S3ExtensionCard />)

    const toggle = await screen.findByRole('switch')
    await waitFor(() => expect(switchChecked(toggle)).toBe(true))
    expect(screen.queryByLabelText(/^nome/i)).toBeNull()
  })

  it('botão "Configurar" abre o formulário mesmo com a extensão já ativa, sem precisar desligar/religar o toggle', async () => {
    mockFetch(
      [
        {
          id: 'ext1',
          name: 'destino-atual',
          endpoint: '',
          bucket: 'bucket-atual',
          region: 'us-east-1',
          prefix: '',
        },
      ],
      undefined,
      true,
    )
    render(<S3ExtensionCard />)

    const toggle = await screen.findByRole('switch')
    await waitFor(() => expect(switchChecked(toggle)).toBe(true))
    expect(screen.queryByLabelText(/^nome/i)).toBeNull()

    fireEvent.click(await screen.findByRole('button', { name: /configurar/i }))

    await screen.findByLabelText(/^nome/i)
    expect(switchChecked(toggle)).toBe(true)
  })

  it('o botão "Configurar" vira "Cancelar" enquanto o formulário está aberto, e fecha ao clicar', async () => {
    mockFetch([])
    render(<S3ExtensionCard />)

    expect(await screen.findByRole('button', { name: /configurar/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /configurar/i }))

    await screen.findByLabelText(/^nome/i)
    expect(screen.queryByRole('button', { name: /^configurar$/i })).toBeNull()
    expect(document.getElementById('s3-config-cancel')).toBeTruthy()

    fireEvent.click(document.getElementById('s3-config-cancel')!)

    expect(screen.queryByLabelText(/^nome/i)).toBeNull()
    expect(await screen.findByRole('button', { name: /configurar/i })).toBeTruthy()
  })

  it('"Cancelar" descarta as edições em curso (não fica "vazando" pra próxima vez que o form reabrir)', async () => {
    mockFetch(
      [
        {
          id: 'ext1',
          name: 'destino-atual',
          endpoint: '',
          bucket: 'bucket-atual',
          region: 'us-east-1',
          prefix: '',
        },
      ],
      undefined,
      true,
    )
    render(<S3ExtensionCard />)

    fireEvent.click(await screen.findByRole('button', { name: /configurar/i }))
    const nameInput = (await screen.findByLabelText(/^nome/i)) as HTMLInputElement
    await waitFor(() => expect(nameInput.value).toBe('destino-atual'))

    fireEvent.change(nameInput, { target: { value: 'editado-descartado' } })
    fireEvent.click(document.getElementById('s3-config-cancel')!)

    fireEvent.click(await screen.findByRole('button', { name: /configurar/i }))
    const reopenedInput = (await screen.findByLabelText(/^nome/i)) as HTMLInputElement
    expect(reopenedInput.value).toBe('destino-atual')
  })

  it('desligar o toggle fecha a configuração de volta', async () => {
    mockFetch(
      [
        {
          id: 'ext1',
          name: 'destino-atual',
          endpoint: '',
          bucket: 'bucket-atual',
          region: 'us-east-1',
          prefix: '',
        },
      ],
      undefined,
      true,
    )
    render(<S3ExtensionCard />)

    const toggle = await screen.findByRole('switch')
    fireEvent.click(await screen.findByRole('button', { name: /configurar/i }))
    await screen.findByLabelText(/^nome/i)

    fireEvent.click(toggle)

    expect(screen.queryByLabelText(/^nome/i)).toBeNull()
  })

  it('"Aplicar" bem-sucedido fecha a configuração de volta', async () => {
    mockFetch([])
    render(<S3ExtensionCard />)

    fireEvent.click(await screen.findByRole('switch'))
    await screen.findByLabelText(/^nome/i)
    fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'meu-s3' } })
    fireEvent.change(screen.getByLabelText(/bucket/i), { target: { value: 'meu-bucket' } })
    fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'AK' } })
    fireEvent.change(screen.getByLabelText(/secret key/i), { target: { value: 'SK' } })

    fireEvent.click(document.getElementById('s3-config-apply')!)

    await waitFor(() => expect(screen.queryByLabelText(/^nome/i)).toBeNull())
  })
})

describe('CA3: "Aplicar" do S3 só habilita quando algo diverge do último valor salvo', () => {
  const existingRow = {
    id: 'ext1',
    name: 'destino-atual',
    endpoint: '',
    bucket: 'bucket-atual',
    region: 'us-east-1',
    prefix: '',
  }

  it('estado inicial (staged bate com salvo): "Aplicar" começa desabilitado', async () => {
    mockFetch([existingRow], undefined, true)
    render(<S3ExtensionCard />)

    fireEvent.click(await screen.findByRole('button', { name: /configurar/i }))
    await screen.findByLabelText(/^nome/i)

    expect((document.getElementById('s3-config-apply') as HTMLButtonElement).disabled).toBe(true)
  })

  it('mudar um campo do formulário habilita "Aplicar"', async () => {
    mockFetch([existingRow], undefined, true)
    render(<S3ExtensionCard />)

    fireEvent.click(await screen.findByRole('button', { name: /configurar/i }))
    await screen.findByLabelText(/^nome/i)
    expect((document.getElementById('s3-config-apply') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'novo-nome' } })

    expect((document.getElementById('s3-config-apply') as HTMLButtonElement).disabled).toBe(false)
  })

  it('reverter o campo para o valor salvo desabilita "Aplicar" de novo', async () => {
    mockFetch([existingRow], undefined, true)
    render(<S3ExtensionCard />)

    fireEvent.click(await screen.findByRole('button', { name: /configurar/i }))
    const nameInput = await screen.findByLabelText(/^nome/i)

    fireEvent.change(nameInput, { target: { value: 'novo-nome' } })
    expect((document.getElementById('s3-config-apply') as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(nameInput, { target: { value: 'destino-atual' } })
    expect((document.getElementById('s3-config-apply') as HTMLButtonElement).disabled).toBe(true)
  })

  it('digitar em access_key/secret_key habilita "Aplicar" mesmo com o resto igual (campos write-only)', async () => {
    mockFetch([existingRow], undefined, true)
    render(<S3ExtensionCard />)

    fireEvent.click(await screen.findByRole('button', { name: /configurar/i }))
    await screen.findByLabelText(/^nome/i)
    expect((document.getElementById('s3-config-apply') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'AK' } })

    expect((document.getElementById('s3-config-apply') as HTMLButtonElement).disabled).toBe(false)
  })

  it('ligar o toggle sozinho (sem mexer no formulário) habilita "Aplicar" — diverge do salvo', async () => {
    mockFetch([existingRow], undefined, false)
    render(<S3ExtensionCard />)

    const toggle = await screen.findByRole('switch')
    await waitFor(() => expect(switchChecked(toggle)).toBe(false))
    expect((document.getElementById('s3-config-apply') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(toggle)

    expect((document.getElementById('s3-config-apply') as HTMLButtonElement).disabled).toBe(false)
  })

  it('"Aplicar" bem-sucedido desabilita o botão de novo', async () => {
    mockFetch([existingRow], undefined, true)
    render(<S3ExtensionCard />)

    fireEvent.click(await screen.findByRole('button', { name: /configurar/i }))
    fireEvent.change(await screen.findByLabelText(/^nome/i), { target: { value: 'novo-nome' } })
    expect((document.getElementById('s3-config-apply') as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(document.getElementById('s3-config-apply')!)

    await waitFor(() => expect(screen.queryByLabelText(/^nome/i)).toBeNull())
    fireEvent.click(await screen.findByRole('button', { name: /configurar/i }))
    await waitFor(() =>
      expect((document.getElementById('s3-config-apply') as HTMLButtonElement).disabled).toBe(true),
    )
  })

  it('editar um campo, desligar o toggle e aplicar resincroniza savedForm — "Aplicar" não fica preso habilitado', async () => {
    mockFetch([existingRow], undefined, true)
    render(<S3ExtensionCard />)

    fireEvent.click(await screen.findByRole('button', { name: /configurar/i }))
    fireEvent.change(await screen.findByLabelText(/^nome/i), {
      target: { value: 'editado-mas-nao-salvo' },
    })

    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(document.getElementById('s3-config-apply')!)

    await waitFor(() => expect(screen.queryByText('Aplicando...')).toBeNull())
    await waitFor(() =>
      expect((document.getElementById('s3-config-apply') as HTMLButtonElement).disabled).toBe(true),
    )
  })
})

describe('CA2: selo de estado salvo (ExtensionActiveToggle) reflete o servidor, não o staged', () => {
  it('selo mostra "Desativado" inicialmente e só reflete "Ativado" depois de aplicar com sucesso', async () => {
    mockFetch([], undefined, false)
    render(<S3ExtensionCard />)

    const toggle = await screen.findByRole('switch')
    await waitFor(() => expect(switchChecked(toggle)).toBe(false))
    expect(screen.getByTestId('s3-active-saved-badge').textContent).toBe('Desativado')

    fireEvent.click(toggle)
    expect(screen.getByTestId('s3-active-saved-badge').textContent).toBe('Desativado')

    fireEvent.change(await screen.findByLabelText(/^nome/i), { target: { value: 'meu-s3' } })
    fireEvent.change(screen.getByLabelText(/bucket/i), { target: { value: 'meu-bucket' } })
    fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'AK' } })
    fireEvent.change(screen.getByLabelText(/secret key/i), { target: { value: 'SK' } })
    fireEvent.click(document.getElementById('s3-config-apply')!)

    await waitFor(() => {
      expect(screen.getByTestId('s3-active-saved-badge').textContent).toBe('Ativado')
    })
  })
})
