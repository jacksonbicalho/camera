import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PreferencesLayout from './PreferencesLayout'

const telegramFixture = {
  id: 'telegram',
  name: 'Telegram',
  category: 'Notificações',
  description: 'Envia notificações de movimento via Telegram.',
  available: true,
  active: false,
}

const s3Fixture = {
  id: 's3',
  name: 'S3',
  category: 'Retenção',
  description: 'Envia gravações expiradas para um destino S3 externo.',
  available: true,
  active: true,
}

function mockExtensionsFetch(list: unknown[] = [telegramFixture, s3Fixture]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      if (String(url) === '/api/settings/extensions') {
        return new Response(JSON.stringify(list), { status: 200 })
      }
      return new Response('{}', { status: 200 })
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderLayout(active: string) {
  return render(
    <MemoryRouter>
      <PreferencesLayout active={active}>
        <p>conteúdo</p>
      </PreferencesLayout>
    </MemoryRouter>,
  )
}

describe('CA2: PreferencesLayout agrupa as extensões por categoria e mostra Aparência/Armazenamento', () => {
  it('mostra as categorias Notificações e Retenção, cada uma com sua extensão', async () => {
    mockExtensionsFetch()
    renderLayout('telegram')

    await screen.findByText('Notificações')
    await screen.findByText('Telegram')
    await screen.findByText('Retenção')
    await screen.findByText('S3')
  })

  it('Notificações (com Telegram) vem antes de Retenção (com S3), refletindo a ordem da API', async () => {
    mockExtensionsFetch()
    renderLayout('telegram')

    const notif = await screen.findByText('Notificações')
    const retencao = await screen.findByText('Retenção')
    expect(notif.compareDocumentPosition(retencao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('preserva a ordem de CHEGADA da API, não ordena alfabeticamente — com S3 vindo antes na resposta, Retenção aparece antes de Notificações', async () => {
    mockExtensionsFetch([s3Fixture, telegramFixture])
    renderLayout('s3')

    const retencao = await screen.findByText('Retenção')
    const notif = await screen.findByText('Notificações')
    expect(retencao.compareDocumentPosition(notif) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sem nenhuma extensão disponível (ex.: fetch falhou ou 403 pra um viewer), não mostra o cabeçalho "Extensões" vazio', async () => {
    mockExtensionsFetch([])
    renderLayout('appearance')

    await screen.findByText('Aparência')
    expect(screen.queryByText('Extensões')).toBeNull()
  })

  it('mostra os itens Aparência e Armazenamento', async () => {
    mockExtensionsFetch()
    renderLayout('telegram')

    await screen.findByText('Aparência')
    await screen.findByText('Armazenamento')
  })

  it('renderiza o conteúdo (children)', async () => {
    mockExtensionsFetch()
    renderLayout('telegram')

    await screen.findByText('conteúdo')
  })

  it('destaca o item ativo', async () => {
    mockExtensionsFetch()
    renderLayout('s3')

    const s3Link = await screen.findByText('S3')
    await waitFor(() => {
      expect(s3Link.getAttribute('aria-current')).toBe('page')
    })
    const telegramLink = screen.getByText('Telegram')
    expect(telegramLink.getAttribute('aria-current')).toBeNull()
  })
})

describe('CA3: cada item do submenu aponta pra sua própria rota', () => {
  it('links corretos pra cada item', async () => {
    mockExtensionsFetch()
    renderLayout('telegram')

    expect((await screen.findByText('Telegram')).getAttribute('href')).toBe(
      '/settings/preferences/extensions/telegram',
    )
    expect(screen.getByText('S3').getAttribute('href')).toBe('/settings/preferences/extensions/s3')
    expect(screen.getByText('Aparência').getAttribute('href')).toBe(
      '/settings/preferences/appearance',
    )
    expect(screen.getByText('Armazenamento').getAttribute('href')).toBe(
      '/settings/preferences/storage',
    )
  })
})
