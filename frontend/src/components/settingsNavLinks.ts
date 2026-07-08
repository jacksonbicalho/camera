// Seções de configuração — compartilhado entre AppSidebar (flyout) e Sidebar
// (flyout do rail enxuto). Lista única evita os dois saírem de sincronia quando
// uma seção nova é adicionada/removida.
export const ADMIN_SETTINGS_LINKS = [
  { to: "/settings/cameras",    label: "Câmeras" },
  { to: "/settings/discover",   label: "Rastrear câmeras" },
  { to: "/preferences/users",   label: "Usuários" },
  { to: "/preferences/server",  label: "Servidor" },
  { to: "/preferences/storage", label: "Armazenamento" },
  { to: "/settings/analysis",   label: "Análise de vídeo" },
  { to: "/preferences/system",  label: "Sistema" },
  { to: "/settings/appearance", label: "Aparência" },
  { to: "/settings/about",      label: "Sobre" },
]

export const VIEWER_SETTINGS_LINKS = ADMIN_SETTINGS_LINKS.filter(
  l => l.to === "/settings/cameras" || l.to === "/settings/appearance" || l.to === "/settings/about"
)
