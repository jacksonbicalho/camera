import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// index.test.ts — index.html não é um componente React (é o shell estático
// da SPA, servido cru pelo backend com um placeholder substituído em
// request-time, ver internal/server/server.go), então não faz sentido
// Testing Library aqui: só leitura de arquivo, confirmando as tags Open
// Graph/Twitter Card exigidas pela spec (ogp.me) + o placeholder que o
// backend substitui.
const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf-8')

// metaContent — extrai o content de uma meta tag pelo name/property, tolerando
// a quebra de linha que o prettier aplica quando a linha passa de printWidth
// (ex.: og:description, cujo texto é mais longo que 100 chars).
function metaContent(attr: 'name' | 'property', key: string): string | null {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, 's')
  const m = html.match(re)
  return m ? m[1] : null
}

describe('CA3: index.html — tags Open Graph/Twitter Card pro compartilhamento do link', () => {
  it('tem as 4 propriedades obrigatórias da spec (og:title, og:type, og:image, og:url)', () => {
    expect(metaContent('property', 'og:title')).toBeTruthy()
    expect(metaContent('property', 'og:type')).toBe('website')
    expect(metaContent('property', 'og:image')).toMatch(/^%%OG_ORIGIN%%/)
    expect(metaContent('property', 'og:url')).toMatch(/^%%OG_ORIGIN%%/)
  })

  it('tem as propriedades recomendadas (og:description, og:site_name, dimensões da imagem 1200x630)', () => {
    expect(metaContent('property', 'og:description')).toBeTruthy()
    expect(metaContent('property', 'og:site_name')).toBeTruthy()
    expect(metaContent('property', 'og:image:width')).toBe('1200')
    expect(metaContent('property', 'og:image:height')).toBe('630')
  })

  it('CA5: usa o banner de compartilhamento (og-image.png, 1200x630), não mais o ícone do PWA', () => {
    expect(metaContent('property', 'og:image')).toMatch(/\/og-image\.png$/)
    expect(metaContent('name', 'twitter:image')).toMatch(/\/og-image\.png$/)
  })

  it('tem o Twitter Card (summary_large_image) com título/descrição/imagem', () => {
    expect(metaContent('name', 'twitter:card')).toBe('summary_large_image')
    expect(metaContent('name', 'twitter:title')).toBeTruthy()
    expect(metaContent('name', 'twitter:description')).toBeTruthy()
    expect(metaContent('name', 'twitter:image')).toMatch(/^%%OG_ORIGIN%%/)
  })
})
