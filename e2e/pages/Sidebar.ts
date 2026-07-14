import type { Page, Locator } from '@playwright/test'

// Sidebar — rail de navegação único do app (ver CLAUDE.md). O flyout de
// Configurações abre via clique no botão #sidebar-config e lista seções
// diferentes por papel (ADMIN_SETTINGS_LINKS/VIEWER_SETTINGS_LINKS,
// settingsNavLinks.ts) — usado pelo cenário viewer pra confirmar que uma
// seção admin-only (ex: Usuários) não aparece pra quem não é admin.
export class Sidebar {
  constructor(private readonly page: Page) {}

  async openSettingsFlyout() {
    await this.page.click('#sidebar-config')
  }

  settingsLink(href: string): Locator {
    return this.page.locator(`a[href="${href}"]`)
  }
}
