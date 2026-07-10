// Seções de configuração — usado pelo flyout de Configurações do Sidebar (rail
// enxuto) e por SettingsLayout (coluna persistente nas páginas top-level de
// /settings/*). "Estatísticas" não é mais uma entrada solta: virou uma aba
// (SystemSettingsTabs) dentro de "Sistema" — admin cai na aba Configuração
// (/settings/system), viewer cai direto na aba Estatísticas (/settings/stats,
// a única que ele consegue usar). Por isso VIEWER_SETTINGS_LINKS não é mais
// derivado de ADMIN_SETTINGS_LINKS por match de `to` — os dois precisam de
// hrefs diferentes pro mesmo label "Sistema".
export const ADMIN_SETTINGS_LINKS = [
  { to: '/settings/cameras', label: 'Câmeras' },
  { to: '/settings/discover', label: 'Rastrear câmeras' },
  { to: '/settings/users', label: 'Usuários' },
  { to: '/settings/server', label: 'Servidor' },
  { to: '/settings/storage', label: 'Armazenamento' },
  { to: '/settings/analysis', label: 'Análise de vídeo' },
  { to: '/settings/system', label: 'Sistema' },
  { to: '/settings/appearance', label: 'Aparência' },
  { to: '/settings/about', label: 'Sobre' },
]

export const VIEWER_SETTINGS_LINKS = [
  { to: '/settings/cameras', label: 'Câmeras' },
  { to: '/settings/appearance', label: 'Aparência' },
  { to: '/settings/stats', label: 'Sistema' },
  { to: '/settings/about', label: 'Sobre' },
]
