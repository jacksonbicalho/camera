import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const packageJsonPath = resolve(here, '../../package.json')

// packageDependencies.test.ts — trava a remoção do MUI/Emotion (história
// refactor/remover-mui-time-range-filter, T2): o TimeRangeFilterPanel (filtro de horário do
// Histórico) era a ÚNICA razão dessas 4 dependências existirem no projeto (o resto do app é
// 100% Tailwind, ver CLAUDE.md) — substituído por um input de hora/minuto próprio (T1), sem
// nenhuma lib de terceiro. Teste simples de conteúdo de arquivo (não precisa rodar
// build/lint pra pegar uma dependência esquecida no package.json).
describe('CA3: nenhuma dependência MUI/Emotion resta no projeto', () => {
  it('package.json não lista @mui/material, @mui/x-date-pickers, @emotion/react nem @emotion/styled', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    const allDeps: Record<string, string> = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }
    const forbidden = ['@mui/material', '@mui/x-date-pickers', '@emotion/react', '@emotion/styled']
    for (const dep of forbidden) {
      expect(allDeps).not.toHaveProperty(dep)
    }
  })
})
