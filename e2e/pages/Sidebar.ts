import type { Page, Locator } from '@playwright/test'

// Sidebar — rail de navegação único do app (ver CLAUDE.md). Seções sempre
// visíveis, empilhadas no rail (sem flyout popup) — Movimentos/
// Administração/Governança só aparecem pro admin (a seção inteira some pro
// viewer, não só os links dentro dela). Usado pelo cenário viewer pra
// confirmar que uma seção admin-only (ex: Usuários, dentro de
// "Administração") não aparece pra quem não é admin.
export class Sidebar {
  constructor(private readonly page: Page) {}

  settingsLink(href: string): Locator {
    return this.page.locator(`a[href="${href}"]`)
  }
}
