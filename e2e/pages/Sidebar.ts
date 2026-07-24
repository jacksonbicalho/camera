import type { Page, Locator } from '@playwright/test'

// Sidebar — rail de navegação único do app (ver CLAUDE.md). Dois flyouts de
// Configurações, cada um com o seu grupo (ADMIN_SETTINGS_GROUPS/
// VIEWER_SETTINGS_GROUPS, settingsNavLinks.ts): #sidebar-config (grupo
// "Configurações" — Câmeras/Rastrear câmeras/Gravações/Momentos/Histórico) e
// #sidebar-config-sistema (grupo "Configurações do Sistema" — Servidor/
// Análise de vídeo/Usuários/Aparência). Usado pelo cenário viewer pra
// confirmar que uma seção admin-only (ex: Usuários, no grupo Sistema) não
// aparece pra quem não é admin.
export class Sidebar {
  constructor(private readonly page: Page) {}

  async openConfiguracoesFlyout() {
    await this.page.click('#sidebar-config')
  }

  async openConfiguracoesSistemaFlyout() {
    await this.page.click('#sidebar-config-sistema')
  }

  settingsLink(href: string): Locator {
    return this.page.locator(`a[href="${href}"]`)
  }
}
