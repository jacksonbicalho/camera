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

describe('CA3: index.html — tags Open Graph/Twitter Card pro compartilhamento do link', () => {
  it('tem as 4 propriedades obrigatórias da spec (og:title, og:type, og:image, og:url)', () => {
    expect(html).toMatch(/<meta property="og:title" content="[^"]+"/)
    expect(html).toMatch(/<meta property="og:type" content="website"/)
    expect(html).toMatch(/<meta property="og:image" content="%%OG_ORIGIN%%[^"]*"/)
    expect(html).toMatch(/<meta property="og:url" content="%%OG_ORIGIN%%[^"]*"/)
  })

  it('tem as propriedades recomendadas (og:description, og:site_name, dimensões da imagem)', () => {
    expect(html).toMatch(/<meta property="og:description" content="[^"]+"/)
    expect(html).toMatch(/<meta property="og:site_name" content="[^"]+"/)
    expect(html).toMatch(/<meta property="og:image:width" content="192"/)
    expect(html).toMatch(/<meta property="og:image:height" content="192"/)
  })

  it('tem o Twitter Card (summary_large_image) com título/descrição/imagem', () => {
    expect(html).toMatch(/<meta name="twitter:card" content="summary_large_image"/)
    expect(html).toMatch(/<meta name="twitter:title" content="[^"]+"/)
    expect(html).toMatch(/<meta name="twitter:description" content="[^"]+"/)
    expect(html).toMatch(/<meta name="twitter:image" content="%%OG_ORIGIN%%[^"]*"/)
  })
})
