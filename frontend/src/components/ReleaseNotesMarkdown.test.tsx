import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import ReleaseNotesMarkdown from './ReleaseNotesMarkdown'

afterEach(cleanup)

describe('ReleaseNotesMarkdown', () => {
  it('renderiza headers ### como título, não como texto cru com #', () => {
    const { container } = render(<ReleaseNotesMarkdown md="### ✨ Novidades" />)
    expect(container.textContent).not.toContain('###')
    expect(container.querySelector('h4')?.textContent).toContain('✨ Novidades')
  })

  it('renderiza itens de lista "- " como <li>, sem o hífen cru', () => {
    const { container } = render(<ReleaseNotesMarkdown md={'- item um\n- item dois'} />)
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toBe('item um')
    expect(container.textContent).not.toMatch(/^- /m)
  })

  it('renderiza **negrito** como <strong>, sem os asteriscos', () => {
    const { container } = render(<ReleaseNotesMarkdown md="- **sidebar**: algo" />)
    expect(container.querySelector('strong')?.textContent).toBe('sidebar')
    expect(container.textContent).not.toContain('**')
  })

  it('renderiza `código` como <code>, sem os crases', () => {
    const { container } = render(<ReleaseNotesMarkdown md="- algo (`57b1648`)" />)
    expect(container.querySelector('code')?.textContent).toBe('57b1648')
    expect(container.textContent).not.toContain('`')
  })

  it('renderiza [texto](url) como link de verdade', () => {
    const { container } = render(
      <ReleaseNotesMarkdown md="**Commits:** [ver diff](https://example.com/compare)" />,
    )
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://example.com/compare')
    expect(link?.textContent).toBe('ver diff')
  })

  it('exemplo real do changelog gerado: título + item com scope/bold/código', () => {
    const md = [
      '### ✨ Novidades',
      '- **history**: reprodução contínua entre gravações (`57b1648`)',
      '- **sidebar**: mover Estatísticas pro sidebar novo (`ec19c42`)',
    ].join('\n')
    const { container } = render(<ReleaseNotesMarkdown md={md} />)
    expect(container.textContent).not.toMatch(/[#*`]/)
    expect(container.querySelectorAll('strong')).toHaveLength(2)
    expect(container.querySelectorAll('code')).toHaveLength(2)
  })
})
