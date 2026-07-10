// Seções de configuração — usado pelo flyout de Configurações do Sidebar (rail
// enxuto) e por SettingsLayout (coluna persistente nas páginas top-level de
// /settings/*). Estatísticas entra aqui (em vez de hardcoded no flyout) pra ter
// uma única fonte pros dois consumidores.
export const ADMIN_SETTINGS_LINKS = [
  { to: '/settings/cameras', label: 'Câmeras' },
  { to: '/settings/discover', label: 'Rastrear câmeras' },
  { to: '/settings/users', label: 'Usuários' },
  { to: '/settings/server', label: 'Servidor' },
  { to: '/settings/storage', label: 'Armazenamento' },
  { to: '/settings/analysis', label: 'Análise de vídeo' },
  { to: '/settings/system', label: 'Sistema' },
  { to: '/settings/appearance', label: 'Aparência' },
  { to: '/settings/stats', label: 'Estatísticas' },
  { to: '/settings/about', label: 'Sobre' },
]

export const VIEWER_SETTINGS_LINKS = ADMIN_SETTINGS_LINKS.filter(
  (l) =>
    l.to === '/settings/cameras' ||
    l.to === '/settings/appearance' ||
    l.to === '/settings/stats' ||
    l.to === '/settings/about',
)
