import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Teste-guarda: fecha a dívida registrada em index.css ("a migração das cores
// cruas... segue incremental — fora desta story") para os arquivos abaixo.
// Mesmo padrão de pages/CameraPage.theme.test.ts (já migrado antes desta
// história): baneia qualquer utilitário da rampa de cinza crua fora de
// styles/. Overlays de vídeo (data-on-video) e accents vívidos continuam
// fora deste teto — por isso VideoBrowserPage.tsx (só usa text-white dentro
// de data-on-video) não entra na lista.
const GRAY_RAMP = /\b[a-z-]*(?:bg|text|border|ring|divide|from|to|via)-gray-\d{2,3}\b/g

const MIGRATED_FILES = [
  'src/components/CameraForm.tsx',
  'src/components/CameraSettingsTabs.tsx',
  'src/components/ConfirmDialog.tsx',
  'src/components/DeviceInfoPanel.tsx',
  'src/components/Player.tsx',
  'src/components/UserForm.tsx',
  'src/pages/ChangePasswordPage.tsx',
  'src/pages/DashboardPage.tsx',
  'src/pages/HistoryPage.tsx',
  'src/pages/LoginPage.tsx',
  'src/pages/NotificationsPage.tsx',
  'src/pages/settings/AnalysisSettingsPage.tsx',
  'src/pages/settings/AppearanceSettingsPage.tsx',
  'src/pages/settings/CameraMotionSettingsPage.tsx',
  'src/pages/settings/CameraStatesSettingsPage.tsx',
  'src/pages/StatsPage.tsx',
]

describe('migração para tokens de tema — arquivos fora de CameraPage', () => {
  it.each(MIGRATED_FILES)('%s não usa nenhuma classe da rampa de cinza crua (*-gray-*)', file => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8')
    const matches = source.match(GRAY_RAMP) ?? []
    expect(matches).toEqual([])
  })
})

describe('padding de cards — convergência para p-4 (dense) / p-5 (form)', () => {
  it('LoginPage/ChangePasswordPage não usam mais o outlier p-8', () => {
    const login = readFileSync(resolve(process.cwd(), 'src/pages/LoginPage.tsx'), 'utf8')
    const changePassword = readFileSync(resolve(process.cwd(), 'src/pages/ChangePasswordPage.tsx'), 'utf8')
    expect(login).not.toMatch(/\bp-8\b/)
    expect(changePassword).not.toMatch(/\bp-8\b/)
  })

  // StatsPage/StorageSettingsPage migraram de SettingsLayout pro Layout novo — o
  // `p-6` que sobra é `contentClassName="p-6"` do Layout (convenção do container de
  // página, igual a toda página nova: ReportsPage/RecordingsPage/VideoBrowserPage),
  // não mais o outlier de padding de card que este teste originalmente guardava.
  it('StatsPage/StorageSettingsPage não têm padding de card outlier (só o container do Layout novo)', () => {
    const stats = readFileSync(resolve(process.cwd(), 'src/pages/StatsPage.tsx'), 'utf8')
    const storage = readFileSync(resolve(process.cwd(), 'src/pages/settings/StorageSettingsPage.tsx'), 'utf8')
    expect(stats.match(/\bp-6\b/g) ?? []).toEqual(['p-6'])
    expect(storage.match(/\bp-6\b/g) ?? []).toEqual(['p-6', 'p-6'])
  })

  it('documenta a convenção de padding (p-4 denso / p-5 formulário) em primitives.css', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/primitives.css'), 'utf8')
    expect(css).toMatch(/p-4/)
    expect(css).toMatch(/p-5/)
    expect(css).toMatch(/padding/i)
  })
})
