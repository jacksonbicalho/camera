import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '../../public')
const manifestPath = resolve(publicDir, 'manifest.json')

// manifestIcons.test.ts — trava o requisito mínimo do Chrome/Android pra gerar
// um WebAPK completo na instalação do PWA (ícone próprio nas notificações e no
// launcher, em vez do atalho/bookmark que usa o ícone genérico do Chrome):
// precisa de pelo menos um ícone PNG >=512x512 no manifest (SVG não conta pro
// requisito de tamanho do WebAPK). Ver work_progress/analysis/202608270551_pwa-icon-512.md.
describe('CA2: manifest.json inclui ícone 512x512 para instalação WebAPK no Android', () => {
  it('tem uma entrada PNG 512x512 no array icons, apontando pra um arquivo existente', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    const icon512 = (manifest.icons as Array<{ src: string; sizes: string; type: string }>).find(
      (icon) => icon.sizes === '512x512' && icon.type === 'image/png',
    )
    expect(icon512).toBeDefined()
    const iconPath = resolve(publicDir, icon512!.src.replace(/^\//, ''))
    expect(existsSync(iconPath)).toBe(true)
  })
})
